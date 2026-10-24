const { Pool } = require('pg');
const { createApp } = require('./app');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function initDb(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, text TEXT NOT NULL)');
      const r = await pool.query('SELECT COUNT(*) FROM messages');
      if (Number(r.rows[0].count) === 0) {
        await pool.query("INSERT INTO messages (text) VALUES ('Frontend -> Backend -> Database working via Jenkins CI/CD!')");
      }
      console.log('Database ready');
      return;
    } catch (e) {
      console.log('Waiting for database...', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

const app = createApp(pool, process.env.APP_VERSION || 'dev');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Backend listening on ' + port));
initDb();
