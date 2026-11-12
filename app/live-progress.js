import { recordTableProgress, unpackTableProgress } from './engine.js';

const modes = { study: 0, quiz: 2, check: 4 };

const validMask = values => Array.isArray(values) && values.length === 2 &&
  values.every(n => Number.isSafeInteger(n) && n >= 0 && n < 2 ** 50);

export function validMarks(value) {
  return value != null && [0, 2, 4].includes(value.mode) && validMask(value.played) && validMask(value.solved) &&
    value.solved.every((n, i) => (BigInt(n) & BigInt(value.played[i])) === BigInt(n));
}

function mark(bits, index) {
  bits[Math.floor(index / 50)] |= 1n << BigInt(index % 50);
}

export function exerciseProgress(activity, session, seen, previous) {
  if (!Object.hasOwn(modes, activity)) return null;
  const played = previous?.played.map(BigInt) ?? [0n, 0n];
  const solved = previous?.solved.map(BigInt) ?? [0n, 0n];
  session.list.forEach((task, i) => {
    if (activity === 'study') {
      if (seen.has(task.id) || i < session.index) mark(played, i);
      if (seen.has(task.id)) mark(solved, i);
    } else if (activity === 'quiz') {
      const result = session.quizResults[i];
      if (result.solved || result.mistakes > 0) mark(played, i);
      if (result.solved) mark(solved, i);
    } else if (session.answers[i] !== undefined) {
      mark(played, i);
      if (session.answers[i] === task.answer) mark(solved, i);
    }
  });
  return { mode: modes[activity], played: played.map(Number), solved: solved.map(Number) };
}

export function countMarks(masks) {
  let count = 0;
  for (const mask of masks) {
    for (let bits = BigInt(mask); bits !== 0n; bits &= bits - 1n) count++;
  }
  return count;
}

export function latestScores(activity, session) {
  if (!Object.hasOwn(modes, activity) || activity === 'study' || session.index !== session.list.length ||
      (activity === 'check' && !session.tracksTableProgress)) return null;
  if (activity === 'check') return recordTableProgress(unpackTableProgress(null), session);
  const scores = Array(10).fill(null);
  session.list.forEach(({ a }, i) => {
    const { solved, mistakes } = session.quizResults[i];
    scores[a - 1] = (scores[a - 1] ?? 0) + Number(solved && mistakes === 0);
  });
  return scores;
}
