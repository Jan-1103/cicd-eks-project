const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../src/app');

function start(pool) {
  return new Promise(resolve => {
    const server = createApp(pool, 'test').listen(0, () => resolve(server));
  });
}

test('GET /health returns ok', async () => {
  const server = await start({ query: async () => ({ rows: [] }) });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).status, 'ok');
  server.close();
});

test('GET /api/health returns 200 when DB is up', async () => {
  const server = await start({ query: async () => ({ rows: [{}] }) });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).db, 'up');
  server.close();
});

test('GET /api/health returns 503 when DB is down', async () => {
  const server = await start({ query: async () => { throw new Error('down'); } });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.strictEqual(res.status, 503);
  server.close();
});

test('GET /api/message returns the stored message', async () => {
  const server = await start({ query: async () => ({ rows: [{ text: 'hello' }] }) });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/message`);
  assert.strictEqual((await res.json()).message, 'hello');
  server.close();
});
