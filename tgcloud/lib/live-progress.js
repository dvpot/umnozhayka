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

export async function readLiveProgress(db, prefix) {
  const params = { ':low': prefix, ':high': prefix + 'g' };
  const [rounds, results] = await Promise.all([
    db.all(`SELECT round_key, mode, played_lo, played_hi, solved_lo, solved_hi, 0 AS correct, 0 AS total
             FROM account_round_progress WHERE ${range}
            UNION ALL
            SELECT round_key, mode, 0, 0, 0, 0, correct, total FROM account_round WHERE ${range}`, params),
    db.all(`SELECT mode, scores FROM account_round_result WHERE ${range} ORDER BY completed_at DESC, id DESC`, params)
  ]);

  // Revision 13 recorded complete rounds. A round resumed by the new client can exist in both tables.
  const uniqueRounds = new Map();
  for (const row of rounds) {
    const { mode } = row;
    const total = Math.max(row.total, countMarks(row.played_lo, row.played_hi));
    const correct = Math.max(mode === 2 ? row.total : row.correct, countMarks(row.solved_lo, row.solved_hi));
    const prior = uniqueRounds.get(row.round_key);
    uniqueRounds.set(row.round_key, { mode, total: Math.max(total, prior?.total ?? 0), correct: Math.max(correct, prior?.correct ?? 0) });
  }
  const totals = [0, 0, 0, 0, 0, 0];
  for (const { mode, total, correct } of uniqueRounds.values()) {
    totals[mode] += correct;
    totals[mode + 1] += total;
  }
  const latest = { quiz: Array(10).fill(null), check: Array(10).fill(null) };
  for (const row of results) {
    const scores = latest[row.mode === 2 ? 'quiz' : 'check'];
    JSON.parse(row.scores).forEach((score, i) => { scores[i] ??= score; });
  }
  return { totals, latest };
}

export async function recordLiveProgress(db, prefix, input, RequestError) {
  const progress = sanitizeMarks(input);
  const { roundId, scores, completedAt } = input;
  if (!progress || typeof roundId !== 'string' || !/^[a-f0-9]{32}$/.test(roundId) ||
      !progress.played.some(Boolean)) throw new RequestError('Некорректная статистика.');
  const { mode, played, solved } = progress;
  if (scores !== null) {
    const valid = mode !== 0 && Number.isSafeInteger(completedAt) && completedAt > 0 && Array.isArray(scores) && scores.length === 10 &&
      scores.every(n => n === null || (Number.isInteger(n) && n >= 0 && n <= 10)) &&
      scores.filter(n => n !== null).length * 10 === countMarks(...played) &&
      scores.reduce((sum, n) => sum + (n ?? 0), 0) <= countMarks(...solved);
    if (!valid) throw new RequestError('Некорректный итог таблицы.');
  }
  const key = prefix + roundId;
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
  return readLiveProgress(db, prefix);
}
