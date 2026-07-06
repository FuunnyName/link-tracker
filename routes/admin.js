const express = require('express');
const { nanoid } = require('nanoid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('login', { error: 'Incorrect password.' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/', requireAuth, (req, res) => {
  const links = db.prepare(`
    SELECT links.*,
      (SELECT COUNT(*) FROM visits WHERE visits.link_id = links.id) AS visit_count,
      (SELECT COUNT(*) FROM visits WHERE visits.link_id = links.id AND consented = 1) AS consented_count,
      (SELECT COUNT(*) FROM visits WHERE visits.link_id = links.id AND consented = 0) AS skipped_count,
      (SELECT COUNT(*) FROM visits WHERE visits.link_id = links.id AND photo_front IS NOT NULL) AS photo_count
    FROM links ORDER BY links.created_at DESC
  `).all();

  res.render('dashboard', {
    links,
    baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`,
  });
});

router.post('/links', requireAuth, (req, res) => {
  const { target_url, label, custom_slug } = req.body;

  if (!target_url || !/^https?:\/\//i.test(target_url)) {
    return res.status(400).send('A valid target URL starting with http:// or https:// is required.');
  }

  let slug = (custom_slug || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!slug) slug = nanoid(8);

  try {
    db.prepare('INSERT INTO links (slug, target_url, label) VALUES (?, ?, ?)').run(slug, target_url, label || null);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).send('That slug is already taken. Choose another.');
    }
    throw err;
  }

  res.redirect('/admin');
});

router.post('/links/:id/delete', requireAuth, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM visits WHERE link_id = ?').run(id);
  db.prepare('DELETE FROM links WHERE id = ?').run(id);
  res.redirect('/admin');
});

router.get('/links/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
  if (!link) return res.status(404).send('Link not found.');

  const visits = db.prepare('SELECT * FROM visits WHERE link_id = ? ORDER BY created_at DESC').all(id);

  res.render('link-detail', {
    link,
    visits,
    baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`,
  });
});

module.exports = router;
