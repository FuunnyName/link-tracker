const express = require('express');
const UAParser = require('ua-parser-js');
const db = require('../db');

const router = express.Router();

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip;
}

// Best-effort IP -> approximate location, used only as a fallback when the
// visitor does not grant browser geolocation permission.
async function ipLookup(ip) {
  if (process.env.ENABLE_IP_FALLBACK !== 'true') return null;
  if (!ip || ip === '::1' || ip === '127.0.0.1') return null;
  try {
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon`);
    const data = await resp.json();
    if (data.status === 'success') {
      return { lat: data.lat, lon: data.lon };
    }
  } catch (err) {
    console.error('IP lookup failed:', err.message);
  }
  return null;
}

// ---- Consent / landing page for a wrapped link ----
router.get('/l/:slug', (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE slug = ?').get(req.params.slug);
  if (!link) return res.status(404).send('This link does not exist or has been removed.');

  res.render('consent', { slug: link.slug });
});

// ---- Receives consent decision + device/location data, then tells the
//      client where to redirect ----
router.post('/api/visit/:slug', async (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE slug = ?').get(req.params.slug);
  if (!link) return res.status(404).json({ error: 'Link not found' });

  const { location, consented } = req.body || {};
  const ua = new UAParser(req.headers['user-agent']);
  const browser = ua.getBrowser();
  const os = ua.getOS();
  const device = ua.getDevice();
  const ip = getClientIp(req);

  let lat = null;
  let lon = null;
  let accuracy = null;
  let locationSource = 'none';

  if (consented && location && typeof location.lat === 'number' && typeof location.lon === 'number') {
    lat = location.lat;
    lon = location.lon;
    accuracy = location.accuracy || null;
    locationSource = 'gps';
  } else {
    const fallback = await ipLookup(ip);
    if (fallback) {
      lat = fallback.lat;
      lon = fallback.lon;
      locationSource = 'ip';
    } else {
      locationSource = 'denied';
    }
  }

  db.prepare(
    `INSERT INTO visits
      (link_id, ip, user_agent, browser, os, device_type, lat, lon, accuracy, location_source, consented)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    link.id,
    ip,
    req.headers['user-agent'] || null,
    `${browser.name || ''} ${browser.version || ''}`.trim() || null,
    `${os.name || ''} ${os.version || ''}`.trim() || null,
    device.type || 'desktop',
    lat,
    lon,
    accuracy,
    locationSource,
    consented ? 1 : 0
  );

  res.json({ redirect: link.target_url });
});

module.exports = router;
