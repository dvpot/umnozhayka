import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { newSession, packSession } from '../app/engine.js';
import { handleAccountPlay } from '../tgcloud/lib/account-play.js';

const empty = [0, 0, 0, 0, 0, 0];
const ctx = id => ({ initData: { user: { id } } });

test('SQLite isolates signed accounts, rejects stale snapshots and deduplicates completed rounds', async () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec(`CREATE TABLE account_play (account_id INTEGER PRIMARY KEY, revision INTEGER, write_id TEXT, state TEXT);
      CREATE TABLE account_round (round_key TEXT PRIMARY KEY, mode INTEGER, correct INTEGER, total INTEGER)`);
    const db = {
      all: async (query, params) => sql.prepare(query).all(params),
      get: async (query, params) => sql.prepare(query).get(params),
      run: async (query, params) => ({ rows: sql.prepare(query).all(params) })
    };
    const call = (id, input) => handleAccountPlay(db, input, ctx(id));
    const state = { v: 1, activity: 'study', roundId: 'e'.repeat(32), game: JSON.parse(packSession(newSession(2))), seen: [],
      revealed: false, counted: false, draft: null, voiceEnabled: true, voiceURI: 'RU' };
    const write = { action: 'save', revision: 0, writeId: 'a'.repeat(32), state, userId: 202 };
    const record = { action: 'record', roundId: state.roundId, totals: [1, 10, 0, 0, 0, 0] };
    await assert.rejects(handleAccountPlay(null, write, {}), /аккаунт/);
    await assert.rejects(call(101, { ...record, totals: [11, 10, 0, 0, 0, 0] }), /статистик/);
    await assert.rejects(call(101, { ...write, state: { ...state, draft: 'личные данные' } }), /состояни/);
    assert.equal((await call(101, { ...write, revision: 2 })).state, null);
    assert.equal((await call(101, write)).revision, 1);
    assert.equal((await call(101, write)).revision, 1);
    assert.equal((await call(101, { ...write, writeId: 'b'.repeat(32) })).writeId, write.writeId);
    assert.deepEqual((await call(101, record)).totals, record.totals);
    assert.deepEqual((await call(101, { ...record, totals: [2, 10, 0, 0, 0, 0] })).totals, record.totals);
    assert.deepEqual((await call(101, { ...record, roundId: 'f'.repeat(32), totals: [0, 0, 9, 10, 0, 0] })).totals,
      [1, 10, 9, 10, 0, 0]);
    const latest = await call(101, { ...write, revision: 1, writeId: 'c'.repeat(32), state: { ...state, voiceEnabled: false } });
    assert.equal(latest.revision, 2);
    assert.equal(latest.state.voiceEnabled, false);
    assert.deepEqual(await call(101, { action: 'read' }), { ...latest, totals: [1, 10, 9, 10, 0, 0] });
    assert.deepEqual(await call(1010, { action: 'read' }), { revision: 0, writeId: null, state: null, totals: empty });
    assert.deepEqual((await call(202, { action: 'read' })).totals, empty);
  } finally {
    sql.close();
  }
});

test('client retries a completed round after a lost acknowledgement and preserves it on snapshot conflict', async () => {
  const { createAccountSync } = await import('../app/account-sync.js');
  let cache;
  let revision = 0;
  let remote = { revision, writeId: null, state: null };
  const rounds = new Map();
  const outbox = new Map();
  const submittedErrors = new Set();
  const sentErrorIds = [];
  let failAfterCommit = true;
  const buildClient = () => createAccountSync({
    cache, persist: next => { cache = structuredClone(next); },
    loadRounds: () => [...outbox.values()],
    persistRound: round => outbox.set(round.key, round),
    removeRound: roundId => outbox.delete(roundId),
    onRemote() {}, onTotals() {},
    async call(input) {
      if (input.action === 'recordLive') {
        sentErrorIds.push(input.wrongIds);
        input.wrongIds.forEach(id => submittedErrors.add(id));
        const prior = rounds.get(input.roundId);
        rounds.set(input.roundId, [0, 0, (prior?.[2] ?? 0) | input.solved[0], (prior?.[3] ?? 0) | input.played[0], 0, 0]);
      }
      const totals = [...rounds.values()].reduce((previous, delta) => previous.map((n, i) => n + delta[i]), empty);
      if (input.action === 'read') return { ...remote, totals };
      if (input.action === 'recordLive') {
        if (failAfterCommit) {
          failAfterCommit = false;
          throw new Error('Response lost');
        }
        return { totals };
      }
      if (input.revision === revision) remote = { revision: ++revision, writeId: input.writeId, state: input.state };
      return remote;
    }
  });
  let client = buildClient();
  await client.sync(true);
  const otherWindow = buildClient();
  client.stage({ index: 10, roundId: 'round-a' }, { mode: 2, played: [8, 0], solved: [0, 0], scores: null, wrong: true });
  await assert.rejects(client.sync(), /Response lost/);
  client.stage({ index: 10, roundId: 'round-a' }, { mode: 2, played: [2, 0], solved: [2, 0], scores: null, wrong: false });
  otherWindow.stage({ index: 1, roundId: 'round-b' });
  assert.equal(outbox.size, 2);
  remote = { revision: ++revision, writeId: 'write-b', state: { index: 5, roundId: 'round-b' } };
  client = buildClient();
  await client.sync(true);
  assert.deepEqual(cache.state, remote.state);
  assert.deepEqual(cache.totals, [0, 0, 2, 10, 0, 0]);
  assert.equal(rounds.size, 1);
  assert.equal(submittedErrors.size, 1);
  assert.deepEqual(sentErrorIds[0], sentErrorIds[1]);
  assert.equal(outbox.size, 0);
  assert.equal(cache.pending, null);
  assert.equal(cache.staged, null);
});
