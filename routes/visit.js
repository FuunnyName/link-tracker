const express = require('express');
const UAParser = require('ua-parser-js');
const db = require('../db');

const router = express.Router();

// Increase JSON body limit for base64 photos
router.use(express.json({ limit: '10mb' }));

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip;
}

async function ipLookup(ip) {
  if (process.env.ENABLE_IP_FALLBACK !== 'true') return null;
  if (!ip || ip === '::1' || ip === '127.0.0.1') return null;
  try {
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon`);
    const data = await resp.json();
    if (data.status === 'success') return { lat: data.lat, lon: data.lon };
  } catch (err) {
    console.error('IP lookup failed:', err.message);
  }
  return null;
}

router.get('/l/:slug', (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE slug = ?').get(req.params.slug);
  if (!link) return res.status(404).send('This link does not exist or has been removed.');
  res.render('consent', { slug: link.slug });
});

router.post('/api/visit/:slug', async (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE slug = ?').get(req.params.slug);
  if (!link) return res.status(404).json({ error: 'Link not found' });

  const {
    location, consented,
    deviceInfo = {},
    photo_front = null,
    photo_back = null,
  } = req.body || {};

  const ua = new UAParser(req.headers['user-agent']);
  const browser = ua.getBrowser();
  const os = ua.getOS();
  const device = ua.getDevice();
  const ip = getClientIp(req);

  let lat = null, lon = null, accuracy = null, locationSource = 'none';

  if (consented && location && typeof location.lat === 'number') {
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

  db.prepare(`
    INSERT INTO visits (
      link_id, ip, user_agent, browser, os, device_type,
      lat, lon, accuracy, location_source, consented,
      screen_resolution, timezone, language, network_type,
      battery_level, battery_charging, cpu_cores, memory_gb,
      referrer, touch_support, photo_front, photo_back
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    link.id, ip,
    req.headers['user-agent'] || null,
    `${browser.name || ''} ${browser.version || ''}`.trim() || null,
    `${os.name || ''} ${os.version || ''}`.trim() || null,
    device.type || 'desktop',
    lat, lon, accuracy, locationSource, consented ? 1 : 0,
    deviceInfo.screen_resolution || null,
    deviceInfo.timezone || null,
    deviceInfo.language || null,
    deviceInfo.network_type || null,
    deviceInfo.battery_level != null ? deviceInfo.battery_level : null,
    deviceInfo.battery_charging != null ? (deviceInfo.battery_charging ? 1 : 0) : null,
    deviceInfo.cpu_cores || null,
    deviceInfo.memory_gb || null,
    deviceInfo.referrer || null,
    deviceInfo.touch_support != null ? (deviceInfo.touch_support ? 1 : 0) : null,
    photo_front || null,
    photo_back || null,
  );

  res.json({ redirect: link.target_url });
});

module.exports = router;
