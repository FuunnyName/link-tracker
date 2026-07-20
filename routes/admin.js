const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/login', (req, res) => res.render('login', { error: null }));

router.post('/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('login', { error: 'Incorrect password.' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT links.*,
        (SELECT COUNT(*) FROM visits WHERE visits.link_id = links.id) AS visit_count,
        (SELECT COUNT(*) FROM visits WHERE visits.link_id = links.id AND consented = 1) AS consented_count,
        (SELECT COUNT(*) FROM visits WHERE visits.link_id = links.id AND consented = 0) AS skipped_count,
        (SELECT COUNT(*) FROM visits WHERE visits.link_id = links.id AND photo_front IS NOT NULL) AS photo_count
      FROM links ORDER BY links.created_at DESC
    `);
    res.render('dashboard', {
      links: result.rows,
      baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch(e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.post('/links', requireAuth, async (req, res) => {
  const { target_url, label, custom_slug } = req.body;

  if (!target_url || !/^https?:\/\//i.test(target_url)) {
    return res.status(400).send('A valid target URL is required.');
  }

  let slug = (custom_slug || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!slug) slug = nanoid(8);

  try {
    await db.execute({
      sql: 'INSERT INTO links (slug, target_url, label) VALUES (?, ?, ?)',
      args: [slug, target_url, label || null]
    });
    res.redirect('/admin');
  } catch(e) {
    if (e.message?.includes('UNIQUE')) {
      return res.status(400).send('That slug is already taken.');
    }
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.post('/links/:id/delete', requireAuth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM visits WHERE link_id = ?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM links WHERE id = ?', args: [req.params.id] });
    res.redirect('/admin');
  } catch(e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

router.get('/links/:id', requireAuth, async (req, res) => {
  try {
    const linkRes = await db.execute({ sql: 'SELECT * FROM links WHERE id = ?', args: [req.params.id] });
    if (linkRes.rows.length === 0) return res.status(404).send('Link not found.');

    const visitsRes = await db.execute({
      sql: 'SELECT * FROM visits WHERE link_id = ? ORDER BY created_at DESC',
      args: [req.params.id]
    });

    res.render('link-detail', {
      link: linkRes.rows[0],
      visits: visitsRes.rows,
      baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`,
    });
  } catch(e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

module.exports = router;