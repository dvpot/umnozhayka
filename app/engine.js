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

export function makeAnswerOptions(task, rng = Math.random) {
  if (!task || !Number.isInteger(task.a) || task.a < 1 || task.a > MAX_FACTOR ||
      !Number.isInteger(task.b) || task.b < 1 || task.b > MAX_FACTOR || task.answer !== task.a * task.b) {
    throw new RangeError('Некорректный пример');
  }
  if (typeof rng !== 'function') throw new TypeError('Генератор случайных чисел должен быть функцией');
  const values = new Set();
  for (let a = 1; a <= MAX_FACTOR; a++) for (let b = 1; b <= MAX_FACTOR; b++) values.add(a * b);
  const nearby = new Set();
  for (const a of [task.a - 1, task.a + 1]) if (a >= 1 && a <= MAX_FACTOR) nearby.add(a * task.b);
  for (const b of [task.b - 1, task.b + 1]) if (b >= 1 && b <= MAX_FACTOR) nearby.add(task.a * b);
  nearby.delete(task.answer);
  const distractors = [...nearby];
  for (const value of values) {
    if (distractors.length >= 2) break;
    if (value !== task.answer && !nearby.has(value)) distractors.push(value);
  }
  const options = [task.answer];
  for (let i = 0; i < 2; i++) {
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
  return { table, random, mode: 'study', index: 0, list: makeExercises(table, random, rng) };
}

export function packSession(s) {
  return JSON.stringify({ v: 3, table: s.table, random: s.random, mode: s.mode, index: s.index, ids: s.list.map(x => x.id) });
}

export function unpackSession(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || typeof data.random !== 'boolean' || !Number.isInteger(data.index)) return null;
  let ordered;
  try { ordered = makeExercises(data.table); } catch { return null; }
  // После обновления ×1…×9 -> ×1…×10 сохраняем режим, начинаем полный новый цикл.
  if (data.v === 1) return newSession(data.table, data.random);
  if ((data.v !== 2 && data.v !== 3) || !Array.isArray(data.ids) || data.ids.length !== ordered.length ||
      data.index < 0 || data.index > ordered.length || new Set(data.ids).size !== ordered.length) return null;
  if (data.v === 3 && data.mode !== 'study' && data.mode !== 'quiz') return null;
  const lookup = new Map(ordered.map(x => [x.id, x]));
  if (!data.ids.every(id => typeof id === 'string' && lookup.has(id))) return null;
  if (!data.random && !data.ids.every((id, i) => id === ordered[i].id)) return null;
  return { table: data.table, random: data.random, mode: data.v === 3 ? data.mode : 'study', index: data.index, list: data.ids.map(id => lookup.get(id)) };
}

export function nextTable(table) {
  return Number.isInteger(table) && table >= 1 && table < MAX_FACTOR ? table + 1 : null;
}
