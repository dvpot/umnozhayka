export function makeExercises(table = 'all', random = false, rng = Math.random) {
  if (table !== 'all' && (!Number.isInteger(table) || table < 1 || table > 9)) throw new RangeError('Таблица от 1 до 9');
  if (typeof random !== 'boolean') throw new TypeError('Режим должен быть boolean');
  const tables = table === 'all' ? [1,2,3,4,5,6,7,8,9] : [table];
  const list = [];
  for (const a of tables) for (let b = 1; b <= 9; b++) list.push({a, b, id: a + 'x' + b, answer: a * b});
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

export function newSession(table = 'all', random = false, rng = Math.random) {
  return {table, random, index: 0, list: makeExercises(table, random, rng)};
}

export function packSession(s) {
  return JSON.stringify({v:1,table:s.table,random:s.random,index:s.index,ids:s.list.map(x => x.id)});
}

export function unpackSession(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!data || data.v !== 1 || typeof data.random !== 'boolean' ||
      !Number.isInteger(data.index)) return null;
  let ordered;
  try { ordered = makeExercises(data.table); } catch { return null; }
  if (!Array.isArray(data.ids) || data.ids.length !== ordered.length ||
      data.index < 0 || data.index > ordered.length ||
      new Set(data.ids).size !== ordered.length) return null;
  const lookup = new Map(ordered.map(x => [x.id, x]));
  if (!data.ids.every(id => typeof id === 'string' && lookup.has(id))) return null;
  if (!data.random && !data.ids.every((id, i) => id === ordered[i].id)) return null;
  return {table:data.table,random:data.random,index:data.index,list:data.ids.map(id => lookup.get(id))};
}

export function nextTable(table) {
  return Number.isInteger(table) && table >= 1 && table < 9 ? table + 1 : null;
}
