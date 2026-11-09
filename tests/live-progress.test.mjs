import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { newCheck, newSession, submitCheckAnswer } from '../app/engine.js';
import { exerciseProgress, latestScores } from '../app/live-progress.js';
import { handleAccountPlay } from '../tgcloud/lib/account-play.js';

test('counts a partial round and upgrades a corrected example without adding an attempt', () => {
  const game = newCheck(2);
  submitCheckAnswer(game, '1');
  assert.deepEqual(exerciseProgress('check', game, new Set()), { mode: 4, played: [1, 0], solved: [0, 0] });
  submitCheckAnswer(game, '2');
  assert.deepEqual(exerciseProgress('check', game, new Set()), { mode: 4, played: [1, 0], solved: [1, 0] });
  assert.equal(latestScores('check', game), null);
  const study = newSession();
  study.index = 51;
  const progress = exerciseProgress('study', study, new Set([study.list[50].id]));
  assert.deepEqual(progress.played, [2 ** 50 - 1, 1]);
  assert.deepEqual(progress.solved, [0, 1]);
});

test('a completed quiz keeps first-attempt table scores separate from solved totals', () => {
  const game = newSession(3);
  game.mode = 'quiz';
  game.index = game.list.length;
  game.quizResults.forEach(result => { result.solved = true; });
  game.quizResults[0].mistakes = 1;
  assert.deepEqual(exerciseProgress('quiz', game, new Set()).solved, [1023, 0]);
  assert.deepEqual(latestScores('quiz', game), [null, null, 9, ...Array(7).fill(null)]);
});
test('SQLite merges partial examples exactly once and keeps the latest table result per mode', async () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec(`CREATE TABLE account_play (account_id INTEGER PRIMARY KEY, revision INTEGER, write_id TEXT, state TEXT);
      CREATE TABLE account_round (round_key TEXT PRIMARY KEY, mode INTEGER, correct INTEGER, total INTEGER);
      CREATE TABLE account_round_progress (round_key TEXT PRIMARY KEY, mode INTEGER, played_lo INTEGER, played_hi INTEGER, solved_lo INTEGER, solved_hi INTEGER);
      CREATE TABLE account_round_result (id INTEGER PRIMARY KEY AUTOINCREMENT, round_key TEXT UNIQUE, mode INTEGER, completed_at INTEGER, scores TEXT);`);
    const db = {
      all: async (query, params) => sql.prepare(query).all(params),
      get: async (query, params) => sql.prepare(query).get(params),
      run: async (query, params) => ({ rows: sql.prepare(query).all(params) })
    };
    const call = (input, id = 123) => handleAccountPlay(db, input, { initData: { user: { id } } });
    const record = (roundId, mode, played, solved, score, completedAt = 100) => ({ action: 'recordLive', roundId: roundId.repeat(32),
      mode, played: [played, 0], solved: [solved, 0], completedAt,
      scores: score === undefined ? null : [score, ...Array(9).fill(null)] });
    const first = record('a', 4, 1023, 1023, 10);
    await call(record('a', 4, 1, 0));
    assert.deepEqual((await call(record('a', 4, 1, 1))).totals, [0, 0, 0, 0, 1, 1]);
    assert.deepEqual((await call(record('a', 4, 2, 2))).totals, [0, 0, 0, 0, 2, 2]);
    await call(first);
    await call(record('b', 4, 1023, 255, 8, 200));
    await call(record('e', 4, 1023, 511, 9, 150));
    await call(first);
    await call(record('c', 2, 1023, 1023, 9));
    const progress = await call({ action: 'progress' });
    assert.deepEqual(progress.totals, [0, 0, 10, 10, 27, 30]);
    assert.equal(progress.latest.check[0], 8);
    assert.equal(progress.latest.quiz[0], 9);
    assert.equal((await call({ action: 'progress' }, 1234)).latest.check[0], null);
    await assert.rejects(call(record('d', 4, 1, 2)), /статистик/);
    await call({ action: 'record', roundId: 'c'.repeat(32), totals: [0, 0, 9, 10, 0, 0] });
    assert.deepEqual((await call({ action: 'progress' })).totals, progress.totals);
    await call({ action: 'record', roundId: 'd'.repeat(32), totals: [0, 0, 8, 10, 0, 0] });
    assert.equal((await call({ action: 'progress' })).totals[2], 20);
  } finally {
    sql.close();
  }
});
