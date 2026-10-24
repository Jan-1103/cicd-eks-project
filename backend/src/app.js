const express = require('express');

// pool is injected so that tests can use a fake database
function createApp(pool, version) {
  const app = express();

  // liveness: is the process alive?
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // readiness / validation: can we reach the database?
  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'up', version });
    } catch (err) {
      res.status(503).json({ status: 'error', db: 'down', version });
    }
  });

  app.get('/api/message', async (req, res) => {
    try {
      const result = await pool.query('SELECT text FROM messages ORDER BY id LIMIT 1');
      res.json({ message: result.rows[0] ? result.rows[0].text : 'no data', version });
    } catch (err) {
      res.status(500).json({ message: 'database error', version });
    }
  });

  return app;
}

module.exports = { createApp };
