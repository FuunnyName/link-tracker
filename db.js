const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function init() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      target_url TEXT NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT,
      browser TEXT,
      os TEXT,
      device_type TEXT,
      lat REAL,
      lon REAL,
      accuracy REAL,
      location_source TEXT,
      consented INTEGER DEFAULT 0,
      screen_resolution TEXT,
      timezone TEXT,
      language TEXT,
      network_type TEXT,
      battery_level REAL,
      battery_charging INTEGER,
      cpu_cores INTEGER,
      memory_gb REAL,
      referrer TEXT,
      touch_support INTEGER,
      photo_front TEXT,
      photo_back TEXT,
      survey_first_name TEXT,
      survey_last_name TEXT,
      survey_age TEXT,
      survey_profession TEXT,
      survey_hobbies TEXT,
      survey_passions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

init().catch(console.error);

module.exports = db;