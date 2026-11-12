export const MAX_FACTOR = 10;

export function makeExercises(table = 'all', random = false, rng = Math.random) {
  if (table !== 'all' && (!Number.isInteger(table) || table < 1 || table > MAX_FACTOR)) {
    throw new RangeError('Таблица от 1 до 10');
  }
  if (typeof random !== 'boolean') throw new TypeError('Режим должен быть boolean');
  const tables = table === 'all' ? Array.from({ length: MAX_FACTOR }, (_, i) => i + 1) : [table];
  const list = [];
  for (const a of tables) for (let b = 1; b <= MAX_FACTOR; b++) {
    list.push({ a, b, id: `${a}x${b}`, answer: a * b });
  }
  if (random) {
    for (let i = list.length - 1; i > 0; i--) {
      const value = rng();
      if (!(value >= 0 && value < 1)) throw new RangeError('Случайное число должно быть в [0,1)');
      const j = Math.floor(value * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  return list;
}

export function makeAnswerOptions(task, rng = Math.random, eliminated = []) {
  if (!task || !Number.isInteger(task.a) || task.a < 1 || task.a > MAX_FACTOR ||
      !Number.isInteger(task.b) || task.b < 1 || task.b > MAX_FACTOR || task.answer !== task.a * task.b) {
    throw new RangeError('Некорректный пример');
  }
  if (typeof rng !== 'function') throw new TypeError('Генератор случайных чисел должен быть функцией');
  if (!Array.isArray(eliminated) || eliminated.length > 2 || new Set(eliminated).size !== eliminated.length ||
      eliminated.some(value => !Number.isInteger(value) || value < 1 || value > 100 || value === task.answer)) {
    throw new RangeError('Некорректные исключённые варианты');
  }
  const values = new Set();
  for (let a = 1; a <= MAX_FACTOR; a++) for (let b = 1; b <= MAX_FACTOR; b++) values.add(a * b);
  const nearby = new Set();
  for (const a of [task.a - 1, task.a + 1]) if (a >= 1 && a <= MAX_FACTOR) nearby.add(a * task.b);
  for (const b of [task.b - 1, task.b + 1]) if (b >= 1 && b <= MAX_FACTOR) nearby.add(task.a * b);
  const used = new Set([task.answer, ...eliminated]);
  const distractors = [...nearby].filter(value => !used.has(value));
  for (const value of values) {
    if (distractors.length >= 2 - eliminated.length) break;
    if (!used.has(value) && !nearby.has(value)) distractors.push(value);
  }
  const options = [task.answer, ...eliminated];
  for (let i = 0; i < 2 - eliminated.length; i++) {
    const sample = rng();
    if (!(sample >= 0 && sample < 1)) throw new RangeError('Случайное число должно быть в [0,1)');
    const index = i + Math.floor(sample * (distractors.length - i));
    [distractors[i], distractors[index]] = [distractors[index], distractors[i]];
    options.push(distractors[i]);
  }
  for (let i = options.length - 1; i > 0; i--) {
    const sample = rng();
    if (!(sample >= 0 && sample < 1)) throw new RangeError('Случайное число должно быть в [0,1)');
    const index = Math.floor(sample * (i + 1));
    [options[i], options[index]] = [options[index], options[i]];
  }
  return options;
}

export function newSession(table = 'all', random = false, rng = Math.random) {
  const list = makeExercises(table, random, rng);
  return { table, random, mode: 'study', index: 0, list,
    quizResults: list.map(task => ({ mistakes: 0, solved: false, eliminated: [], options: makeAnswerOptions(task, rng) })) };
}

export function newReviewSession(ids, table = 'all', random = false, rng = Math.random) {
  const source = new Map(makeExercises(table).map(task => [task.id, task]));
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > source.size ||
      new Set(ids).size !== ids.length || ids.some(id => !source.has(id))) {
    throw new RangeError('Некорректный список примеров для повтора');
  }
  const list = ids.map(id => source.get(id));
  if (random) {
    for (let i = list.length - 1; i > 0; i--) {
      const value = rng();
      if (!(value >= 0 && value < 1)) throw new RangeError('Случайное число должно быть в [0,1)');
      const j = Math.floor(value * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  return { table, random, mode: 'quiz', review: true, index: 0, list,
    quizResults: list.map(task => ({ mistakes: 0, solved: false, eliminated: [], options: makeAnswerOptions(task, rng) })) };
}

export function packSession(s) {
  return JSON.stringify({ v: 6, table: s.table, random: s.random, mode: s.mode, review: s.review === true, index: s.index,
    ids: s.list.map(x => x.id), quizResults: s.quizResults });
}

export function unpackSession(raw) {
  if (typeof raw !== 'string' || raw.length > 16384) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data.random !== 'boolean' || !Number.isInteger(data.index)) return null;
  let ordered;
  try { ordered = makeExercises(data.table); } catch { return null; }
  // После обновления ×1…×9 -> ×1…×10 сохраняем режим, начинаем полный новый цикл.
  if (data.v === 1) return newSession(data.table, data.random);
  const review = data.v === 6 && data.review === true;
  if (![2, 3, 4, 5, 6].includes(data.v) || (data.v === 6 && typeof data.review !== 'boolean') ||
      !Array.isArray(data.ids) || data.ids.length < (review ? 1 : ordered.length) || data.ids.length > ordered.length ||
      data.index < 0 || data.index > data.ids.length || new Set(data.ids).size !== data.ids.length) return null;
  if (data.v >= 3 && data.mode !== 'study' && data.mode !== 'quiz') return null;
  if (review && data.mode !== 'quiz') return null;
  const lookup = new Map(ordered.map(x => [x.id, x]));
  if (!data.ids.every(id => typeof id === 'string' && lookup.has(id))) return null;
  if (!review && data.ids.length !== ordered.length) return null;
  if (!review && !data.random && !data.ids.every((id, i) => id === ordered[i].id)) return null;
  const list = data.ids.map(id => lookup.get(id));
  let quizResults = list.map(task => ({ mistakes: 0, solved: false, eliminated: [], options: makeAnswerOptions(task) }));
  if (data.v >= 4) {
    if (!Array.isArray(data.quizResults) || data.quizResults.length !== data.ids.length ||
        !data.quizResults.every(result => result && Number.isInteger(result.mistakes) && result.mistakes >= 0 && result.mistakes <= 2 &&
          typeof result.solved === 'boolean' && Array.isArray(result.eliminated) && result.eliminated.length === result.mistakes &&
          new Set(result.eliminated).size === result.eliminated.length && result.eliminated.every(value => Number.isInteger(value) && value >= 1 && value <= 100))) return null;
    if (data.quizResults.some((result, i) => result.eliminated.includes(lookup.get(data.ids[i]).answer))) return null;
    quizResults = data.quizResults.map((result, i) => {
      const task = lookup.get(data.ids[i]);
      const options = data.v >= 5 ? result.options : makeAnswerOptions(task, Math.random, result.eliminated);
      if (!Array.isArray(options) || options.length !== 3 || new Set(options).size !== 3 ||
          !options.includes(task.answer) || !result.eliminated.every(value => options.includes(value)) ||
          options.some(value => !Number.isInteger(value) || value < 1 || value > 100)) return null;
      return { mistakes: result.mistakes, solved: result.solved, eliminated: [...result.eliminated], options: [...options] };
    });
    if (quizResults.some(result => result === null)) return null;
  }
  return { table: data.table, random: data.random, mode: data.v >= 3 ? data.mode : 'study', ...(review ? { review: true } : {}), index: data.index,
    list, quizResults };
}

export function chooseQuizAnswer(session, value) {
  if (!session || session.mode !== 'quiz' || !Number.isInteger(value) ||
      session.index < 0 || session.index >= session.list.length) return null;
  const result = session.quizResults[session.index];
  if (result.solved || result.eliminated.includes(value)) return null;
  if (value === session.list[session.index].answer) {
    result.solved = true;
    return 'correct';
  }
  result.mistakes++;
  result.eliminated.push(value);
  return 'incorrect';
}

export function missedExerciseIds(activity, session) {
  if (activity === 'review') return session.list.flatMap((task, i) => session.quizResults[i].solved ? [] : [task.id]);
  if (activity === 'check') return session.list.flatMap((task, i) => session.mistakes[i] > 0 ? [task.id] : []);
  if (activity === 'quiz') return session.list.flatMap((task, i) => session.quizResults[i].mistakes > 0 ? [task.id] : []);
  return [];
}

export function quizTotals(session) {
  return session.quizResults.reduce((totals, result) => ({
    correct: totals.correct + Number(result.solved), incorrect: totals.incorrect + result.mistakes
  }), { correct: 0, incorrect: 0 });
}

export function nextTable(table) {
  return Number.isInteger(table) && table >= 1 && table < MAX_FACTOR ? table + 1 : null;
}

export function newCheck(table, random, rng) {
  return { ...newSession(table, random, rng), answers: [], mistakes: [], tracksTableProgress: true };
}

export function submitCheckAnswer(check, digits) {
  if (check.index >= check.list.length || typeof digits !== 'string' || !/^\d{1,3}$/.test(digits)) return false;
  const canAdd = check.index === check.answers.length;
  const canCorrect = check.index === check.answers.length - 1 && check.answers[check.index] !== check.list[check.index].answer;
  if (!canAdd && !canCorrect) return false;
  const answer = Number(digits);
  if (canAdd) {
    check.answers.push(answer);
    check.mistakes.push(Number(answer !== check.list[check.index].answer));
  } else {
    check.answers[check.index] = answer;
    if (answer !== check.list[check.index].answer) check.mistakes[check.index]++;
  }
  return true;
}

export function advanceCheck(check) {
  if (check.index >= check.answers.length) return false;
  check.index++;
  return true;
}

export function checkTotals(check) {
  const correct = check.answers.filter((answer, i) => answer === check.list[i].answer).length;
  return { correct, incorrect: check.mistakes.reduce((total, count) => total + count, 0) };
}

export function unpackTableProgress(raw) {
  try {
    const scores = JSON.parse(raw);
    if (Array.isArray(scores) && scores.length === MAX_FACTOR &&
        scores.every(score => score === null || (Number.isInteger(score) && score >= 0 && score <= MAX_FACTOR))) {
      return scores;
    }
  } catch { /* Повреждённое сохранение считается пустым. */ }
  return Array(MAX_FACTOR).fill(null);
}

export function recordTableProgress(best, check) {
  if (!check.tracksTableProgress || check.index !== check.list.length || check.answers.length !== check.list.length) return best;
  const scores = Array(MAX_FACTOR).fill(null);
  check.list.forEach(({ a, answer }, i) => {
    const firstTry = check.answers[i] === answer && check.mistakes[i] === 0;
    scores[a - 1] = (scores[a - 1] ?? 0) + Number(firstTry);
  });
  return mergeTableProgress(best, scores);
}

export function mergeTableProgress(best, scores) {
  const next = best.map((previous, i) => {
    const score = scores[i];
    return score !== null && (previous === null || score > previous) ? score : previous;
  });
  return next.some((score, i) => score !== best[i]) ? next : best;
}

export function packCheck(check) {
  return JSON.stringify({
    v: 6, session: JSON.parse(packSession(check)), answers: check.answers, mistakes: check.mistakes,
    tracksTableProgress: check.tracksTableProgress
  });
}

export function unpackCheck(raw) {
  if (typeof raw !== 'string' || raw.length > 16384) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (![3, 4, 5, 6].includes(data?.session?.v) || !Array.isArray(data.answers)) return null;
  const session = unpackSession(JSON.stringify(data.session));
  if (!session || session.mode !== 'study') return null;
  const { answers } = data;
  if (answers.length < session.index || answers.length > Math.min(session.index + 1, session.list.length) ||
      !answers.every(value => Number.isInteger(value) && value >= 0 && value <= 999)) return null;
  const mistakes = data.v >= 5 ? data.mistakes : answers.map((value, i) => Number(value !== session.list[i].answer));
  if (!Array.isArray(mistakes) || mistakes.length !== answers.length ||
      !mistakes.every((value, i) => Number.isInteger(value) && value >= Number(answers[i] !== session.list[i].answer))) return null;
  // Старая проверка могла потерять историю первых попыток при миграции.
  const tracksTableProgress = data.v >= 5 && data.tracksTableProgress === true;
  return { ...session, answers, mistakes, tracksTableProgress };
}
