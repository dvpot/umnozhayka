import { readLiveProgress, recordLiveProgress, sanitizeMarks } from './live-progress.js';

const fields = 'revision, write_id, state';
const opaqueId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const exerciseId = id => typeof id === 'string' && /^(?:10|[1-9])x(?:10|[1-9])$/.test(id);

function sanitizeState(state) {
  const { activity, roundId, draft, seen, revealed, counted, voiceEnabled, voiceURI } = state ?? {};
  const review = activity === 'review';
  if (state?.v !== 1 || !opaqueId(roundId) || !['study', 'quiz', 'check', 'review'].includes(activity) ||
      typeof revealed !== 'boolean' || typeof counted !== 'boolean' || typeof voiceEnabled !== 'boolean' ||
      typeof voiceURI !== 'string' || voiceURI.length > 256 ||
      (draft !== null && !(activity === 'check' && typeof draft === 'string' && /^\d{0,3}$/.test(draft))) ||
      !Array.isArray(seen) || seen.length > 100 || !seen.every(exerciseId)) return null;
  const check = activity === 'check';
  const source = check ? state.game?.session : state.game;
  const { table, random, mode, index, ids, quizResults } = source ?? {};
  const expectedLength = table === 'all' ? 100 : 10;
  if (![5, 6].includes(source?.v) || (table !== 'all' && (!integer(table, 10) || table === 0)) ||
      typeof random !== 'boolean' || mode !== (check ? 'study' : review ? 'quiz' : activity) ||
      (source.v === 6 && (typeof source.review !== 'boolean' || source.review !== review)) ||
      (review && source.v !== 6) || !Array.isArray(ids) ||
      ids.length < (review ? 1 : expectedLength) || ids.length > expectedLength || !ids.every(exerciseId) ||
      new Set(ids).size !== ids.length ||
      (review && table !== 'all' && !ids.every(id => id.startsWith(`${table}x`))) ||
      !integer(index, ids.length) || !Array.isArray(quizResults) || quizResults.length !== ids.length ||
      !quizResults.every(result => result && integer(result.mistakes, 2) && typeof result.solved === 'boolean' &&
        Array.isArray(result.options) && result.options.length === 3 && result.options.every(n => integer(n, 100)) &&
        Array.isArray(result.eliminated) && result.eliminated.length === result.mistakes &&
        result.eliminated.every(n => integer(n, 100)))) return null;
  if (!review && ids.length !== expectedLength) return null;
  const session = { v: source.v, table, random, mode, index, ids, ...(source.v === 6 ? { review } : {}),
    quizResults: quizResults.map(({ mistakes, solved, options, eliminated }) => ({ mistakes, solved, options, eliminated })) };
  let game = session;
  if (check) {
    const { answers, mistakes, tracksTableProgress } = state.game;
    if (![5, 6].includes(state.game.v) || !Array.isArray(answers) || answers.length < index ||
        answers.length > Math.min(index + 1, ids.length) || !answers.every(n => integer(n, 999)) ||
        !Array.isArray(mistakes) || mistakes.length !== answers.length ||
        !mistakes.every(n => integer(n, Number.MAX_SAFE_INTEGER)) || typeof tracksTableProgress !== 'boolean') return null;
    game = { v: 5, session, answers, mistakes, tracksTableProgress };
  }
  const progress = sanitizeMarks(state.progress);
  if ((review && state.progress != null) ||
      (state.progress != null && (!progress || progress.mode !== ['study', 'quiz', 'check'].indexOf(activity) * 2))) return null;
  return { v: 1, activity, roundId, game, draft, seen, revealed, counted, voiceEnabled, voiceURI,
    ...(progress ? { progress } : {}) };
}

async function readTotals(db, prefix) {
  // The primary key starts with the signed account ID and a separator; the suffix is hexadecimal.
  const rows = await db.all(
    'SELECT mode, sum(correct) AS correct, sum(total) AS total FROM account_round WHERE round_key >= :low AND round_key < :high GROUP BY mode',
    { ':low': prefix, ':high': prefix + 'g' }
  );
  const totals = [0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    totals[row.mode] = row.correct;
    totals[row.mode + 1] = row.total;
  }
  return totals;
}

export async function handleAccountPlay(db, input, ctx, RequestError = Error) {
  const id = ctx?.initData?.user?.id;
  if (!Number.isSafeInteger(id) || id <= 0) throw new RequestError('Нужен аккаунт Telegram.');
  const params = { ':id': id };
  const prefix = id + ':';
  if (input?.action === 'recordLive') return recordLiveProgress(db, prefix, input, RequestError);
  if (input?.action === 'record') {
    const { roundId, totals } = input;
    const modes = Array.isArray(totals) ? [0, 2, 4].filter(i => totals[i + 1] > 0) : [];
    const [mode] = modes;
    if (!opaqueId(roundId) || modes.length !== 1 || totals.length !== 6 ||
        !totals.every((n, i) => i === mode || i === mode + 1 ? integer(n, 100) : n === 0) ||
        ![10, 100].includes(totals[mode + 1]) || totals[mode] > totals[mode + 1]) {
      throw new RequestError('Некорректная статистика.');
    }
    await db.run(
      'INSERT INTO account_round (round_key, mode, correct, total) VALUES (:key, :mode, :correct, :total) ON CONFLICT(round_key) DO NOTHING',
      { ':key': prefix + roundId, ':mode': mode, ':correct': totals[mode], ':total': totals[mode + 1] }
    );
    return { totals: await readTotals(db, prefix) };
  }

  let row;
  if (input?.action === 'save') {
    const { revision, writeId } = input;
    if (!integer(revision, Number.MAX_SAFE_INTEGER - 1) || !opaqueId(writeId)) {
      throw new RequestError('Некорректная версия игры.');
    }
    const state = sanitizeState(input.state);
    if (!state) throw new RequestError('Некорректное состояние игры.');
    const values = { ...params, ':revision': revision, ':write': writeId, ':state': JSON.stringify(state) };
    const result = await db.run(
      `INSERT INTO account_play (account_id, ${fields})
       SELECT :id, :revision + 1, :write, :state
       WHERE :revision = 0 OR EXISTS (SELECT 1 FROM account_play WHERE account_id = :id)
       ON CONFLICT(account_id) DO UPDATE SET revision = excluded.revision, write_id = excluded.write_id, state = excluded.state
       WHERE account_play.revision = :revision AND account_play.write_id <> :write
       RETURNING ${fields}`, values);
    [row] = result.rows;
  } else if (!['read', 'progress', 'progressAttempts'].includes(input?.action)) {
    throw new RequestError('Неизвестное действие.');
  }
  row ??= await db.get(`SELECT ${fields} FROM account_play WHERE account_id = :id`, params);
  return {
    revision: row?.revision ?? 0, writeId: row?.write_id ?? null,
    state: row ? JSON.parse(row.state) : null,
    ...(['progress', 'progressAttempts'].includes(input.action)
      ? await readLiveProgress(db, prefix, input.action === 'progressAttempts') : {}),
    ...(input.action === 'read' ? { totals: await readTotals(db, prefix) } : {})
  };
}
