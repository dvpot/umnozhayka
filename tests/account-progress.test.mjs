import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTableProgress } from '../tgcloud/lib/table-progress.js';

const sqlite = await import('node:sqlite').catch(() => null);
const scores = (...values) => Array.from({ length: 10 }, (_, i) => values[i] ?? null);
const ctx = id => ({ initData: { user: { id, first_name: 'Ignored' } } });

test('API rejects unauthenticated and malformed requests before accessing SQLite', async () => {
  await assert.rejects(handleTableProgress(null, { action: 'read', userId: 101 }, {}), /аккаунт Telegram/);
  await assert.rejects(handleTableProgress(null, { action: 'merge', scores: scores(11) }, ctx(101)), /результат/);
  await assert.rejects(handleTableProgress(null, { action: 'merge', scores: [7] }, ctx(101)), /результат/);
  await assert.rejects(handleTableProgress(null, { action: 'other' }, ctx(101)), /действие/);
});

test('SQLite combines results atomically by signed account and rejects requests to delete statistics', { skip: !sqlite }, async () => {
  const sql = new sqlite.DatabaseSync(':memory:');
  try {
    const fields = scores().map((_, i) => `x${i + 1} INTEGER`).join(', ');
    sql.exec(`CREATE TABLE table_progress (account_id INTEGER PRIMARY KEY, ${fields})`);
    const db = {
      get: async (query, params) => sql.prepare(query).get(params),
      run: async (query, params) => ({ rows: sql.prepare(query).all(params) })
    };
    const call = (userId, input) => handleTableProgress(db, input, ctx(userId));
    assert.deepEqual(await call(101, { action: 'read', userId: 202 }), { scores: scores() });
    assert.deepEqual(await call(101, { action: 'merge', scores: scores(7, 0), userId: 202 }), { scores: scores(7, 0) });
    assert.deepEqual(await call(101, { action: 'merge', scores: scores(5, null, 10) }), { scores: scores(7, 0, 10) });
    assert.deepEqual(await call(101, { action: 'read' }), { scores: scores(7, 0, 10) });
    assert.deepEqual(await call(202, { action: 'read' }), { scores: scores() });
    await call(202, { action: 'merge', scores: scores(9) });
    await assert.rejects(call(101, { action: 'clear', userId: 202 }), /действие/);
    assert.deepEqual(await call(101, { action: 'read' }), { scores: scores(7, 0, 10) });
    assert.deepEqual(await call(202, { action: 'read' }), { scores: scores(9) });
    assert.equal(sql.prepare('SELECT count(*) AS count FROM table_progress').get().count, 2);
  } finally {
    sql.close();
  }
});
