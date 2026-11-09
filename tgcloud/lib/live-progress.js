const modes = [0, 2, 4];
const fields = ['played_lo', 'played_hi', 'solved_lo', 'solved_hi'];
const maxMask = 2 ** 50 - 1;
const range = 'round_key >= :low AND round_key < :high';
const mask = pair => Array.isArray(pair) && pair.length === 2 &&
  pair.every(n => Number.isSafeInteger(n) && n >= 0 && n <= maxMask);

export function sanitizeMarks(value) {
  if (!value || !modes.includes(value.mode) || !mask(value.played) || !mask(value.solved) ||
      value.solved.some((n, i) => (BigInt(n) & BigInt(value.played[i])) !== BigInt(n))) return null;
  return { mode: value.mode, played: value.played, solved: value.solved };
}

function countMarks(...masks) {
  let count = 0;
  for (const word of masks) {
    for (let bits = BigInt(word); bits !== 0n; bits &= bits - 1n) count++;
  }
  return count;
}

function roundHistory(db, where, params) {
  return db.all(`SELECT round_key, mode, played_lo, played_hi, solved_lo, solved_hi, 0 AS correct, 0 AS total
                 FROM account_round_progress WHERE ${where}
                UNION ALL
                SELECT round_key, mode, 0, 0, 0, 0, correct, total FROM account_round WHERE ${where}`, params);
}

function knownErrors(row) {
  return Math.max(row.total - row.correct, countMarks(row.played_lo, row.played_hi) - countMarks(row.solved_lo, row.solved_hi));
}

export async function readLiveProgress(db, prefix, includeErrors = false) {
  const params = { ':low': prefix, ':high': prefix + 'g' };
  const [rounds, results, savedErrors] = await Promise.all([
    roundHistory(db, range, params),
    db.all(`SELECT round_key, mode, scores FROM account_round_result WHERE ${range} ORDER BY completed_at DESC, id DESC`, params),
    includeErrors
      ? db.all(`SELECT substr(error_key, 1, :length) AS round_key, sum(errors) AS errors
                FROM account_round_error WHERE error_key >= :low AND error_key < :high GROUP BY 1`,
        { ...params, ':length': prefix.length + 32 })
      : []
  ]);
  // Revision 13 recorded complete rounds. A round resumed by the new client can exist in both tables.
  const uniqueRounds = new Map();
  for (const row of rounds) {
    const { mode } = row;
    const total = Math.max(row.total, countMarks(row.played_lo, row.played_hi));
    const correct = Math.max(mode === 2 ? row.total : row.correct, countMarks(row.solved_lo, row.solved_hi));
    const prior = uniqueRounds.get(row.round_key);
    uniqueRounds.set(row.round_key, { mode, total: Math.max(total, prior?.total ?? 0),
      correct: Math.max(correct, prior?.correct ?? 0), known: Math.max(knownErrors(row), prior?.known ?? 0) });
  }
  const latest = { quiz: Array(10).fill(null), check: Array(10).fill(null) };
  for (const row of results) {
    const stored = JSON.parse(row.scores);
    const scores = latest[row.mode === 2 ? 'quiz' : 'check'];
    stored.forEach((score, i) => { scores[i] ??= score; });
    const round = uniqueRounds.get(row.round_key);
    if (includeErrors && round) {
      const missedFirstAttempt = stored.reduce((count, score) => count + (score === null ? 0 : 10 - score), 0);
      round.known = Math.max(round.known, missedFirstAttempt);
    }
  }
  const totals = [0, 0, 0, 0, 0, 0];
  const errorCounts = new Map(savedErrors.map(row => [row.round_key, row.errors]));
  const errors = [0, 0];
  for (const [key, { mode, total, correct, known }] of uniqueRounds) {
    totals[mode] += correct;
    totals[mode + 1] += total;
    if (includeErrors && mode !== 0) errors[mode / 2 - 1] += Math.max(known, errorCounts.get(key) ?? 0);
  }
  return includeErrors ? { totals, latest, errors } : { totals, latest };
}

async function preserveLegacyErrors(db, roundKey) {
  const key = roundKey + ':base';
  if (await db.get('SELECT errors FROM account_round_error WHERE error_key = :key', { ':key': key })) return;
  const rows = await roundHistory(db, 'round_key = :round', { ':round': roundKey });
  const errors = rows.reduce((count, row) => Math.max(count, knownErrors(row)), 0);
  // Preserve the recoverable old errors before a new correct answer can change the masks.
  await db.run('INSERT INTO account_round_error (error_key, errors) VALUES (:key, :errors) ON CONFLICT(error_key) DO NOTHING',
    { ':key': key, ':errors': errors });
}

async function recordErrors(db, roundKey, ids) {
  const params = Object.fromEntries(ids.map((id, i) => [':e' + i, roundKey + ':' + id]));
  const rows = Object.keys(params).map(name => `(${name}, 1)`).join(', ');
  await db.run(`INSERT INTO account_round_error (error_key, errors) VALUES ${rows} ON CONFLICT(error_key) DO NOTHING`, params);
}

async function legacyErrorIds(db, roundKey, played, solved) {
  const before = await db.get('SELECT played_lo, played_hi FROM account_round_progress WHERE round_key = :key',
    { ':key': roundKey });
  const previous = [before?.played_lo ?? 0, before?.played_hi ?? 0];
  const ids = [];
  played.forEach((mask, i) => {
    // Old payloads only establish a new error when the example was previously unmarked.
    const unresolved = BigInt(mask) & ~BigInt(solved[i]) & ~BigInt(previous[i]);
    for (let bit = 0; bit < 50; bit++) {
      if ((unresolved & (1n << BigInt(bit))) !== 0n) ids.push('legacy-' + (i * 50 + bit));
    }
  });
  return ids;
}

export async function recordLiveProgress(db, prefix, input, RequestError) {
  const progress = sanitizeMarks(input);
  const { roundId, scores, completedAt, wrongIds } = input;
  if (!progress || typeof roundId !== 'string' || !/^[a-f0-9]{32}$/.test(roundId) ||
      !progress.played.some(Boolean)) throw new RequestError('Некорректная статистика.');
  const { mode, played, solved } = progress;
  const trackErrors = wrongIds !== undefined;
  if (trackErrors && (!Array.isArray(wrongIds) || wrongIds.length > 100 ||
      wrongIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) ||
      (mode === 0 && wrongIds.length))) throw new RequestError('Некорректные попытки.');
  if (scores !== null) {
    const valid = mode !== 0 && Number.isSafeInteger(completedAt) && completedAt > 0 && Array.isArray(scores) && scores.length === 10 &&
      scores.every(n => n === null || (Number.isInteger(n) && n >= 0 && n <= 10)) &&
      scores.filter(n => n !== null).length * 10 === countMarks(...played) &&
      scores.reduce((sum, n) => sum + (n ?? 0), 0) <= countMarks(...solved);
    if (!valid) throw new RequestError('Некорректный итог таблицы.');
  }
  const key = prefix + roundId;
  if (mode !== 0) {
    await preserveLegacyErrors(db, key);
    const errors = wrongIds ?? await legacyErrorIds(db, key, played, solved);
    if (errors.length) await recordErrors(db, key, errors);
  }
  const names = fields.join(', ');
  const merge = fields.map(column => `${column} = account_round_progress.${column} | excluded.${column}`).join(', ');
  await db.run(
    `INSERT INTO account_round_progress (round_key, mode, ${names})
     VALUES (:key, :mode, :played_lo, :played_hi, :solved_lo, :solved_hi)
     ON CONFLICT(round_key) DO UPDATE SET ${merge} WHERE account_round_progress.mode = :mode`,
    { ':key': key, ':mode': mode, ':played_lo': played[0], ':played_hi': played[1], ':solved_lo': solved[0], ':solved_hi': solved[1] }
  );
  if (scores !== null) {
    await db.run(
      `INSERT INTO account_round_result (round_key, mode, completed_at, scores)
       SELECT :key, :mode, :completed, :scores WHERE EXISTS (SELECT 1 FROM account_round_progress WHERE round_key = :key AND mode = :mode)
       ON CONFLICT(round_key) DO NOTHING`,
      { ':key': key, ':mode': mode, ':completed': Math.min(completedAt, Date.now()), ':scores': JSON.stringify(scores) }
    );
  }
  return readLiveProgress(db, prefix, trackErrors);
}
