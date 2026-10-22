import test from 'node:test';
import assert from 'node:assert/strict';
import { makeExercises, newSession, packSession, unpackSession, nextTable } from '../app/engine.js';

test('Все: 81 уникальный пример', () => {
  const list = makeExercises();
  assert.equal(list.length, 81);
  assert.equal(new Set(list.map(x => x.id)).size, 81);
  assert.deepEqual(list[0], {a:1,b:1,id:'1x1',answer:1});
  assert.deepEqual(list[80], {a:9,b:9,id:'9x9',answer:81});
});
test('Отдельные таблицы: все 9 примеров по порядку', () => {
  for (let n = 1; n <= 9; n++) {
    const list = makeExercises(n);
    assert.equal(list.length, 9);
    assert.ok(list.every((x,i) => x.a === n && x.b === i+1 && x.answer === n*(i+1)));
  }
});
test('Перемешивание без повторений и пропусков', () => {
  const ordered = makeExercises(7);
  const random = makeExercises(7,true,() => 0);
  assert.deepEqual(random.map(x=>x.id).sort(),ordered.map(x=>x.id).sort());
  assert.notDeepEqual(random.map(x=>x.id),ordered.map(x=>x.id));
});
test('Восстановление случайного порядка и индекса после закрытия', () => {
  const s = newSession('all',true,() => 0);
  s.index = 31;
  assert.deepEqual(unpackSession(packSession(s)),s);
});
test('Некорректный и устаревший localStorage игнорируется', () => {
  const s = JSON.parse(packSession(newSession(3)));
  assert.equal(unpackSession('bad'),null);
  assert.equal(unpackSession(JSON.stringify({...s, index:10})),null);
  assert.equal(unpackSession(JSON.stringify({...s, ids: Array(9).fill('3x1')})),null);
  assert.equal(unpackSession(JSON.stringify({...s, ids:s.ids.slice().reverse()})),null);
  assert.equal(unpackSession(JSON.stringify({...s, table:10})),null);
});
test('Следующая таблица и защита параметров', () => {
  assert.equal(nextTable(1),2);
  assert.equal(nextTable(8),9);
  assert.equal(nextTable(9),null);
  assert.equal(nextTable('all'),null);
  assert.throws(() => makeExercises(10), RangeError);
  assert.throws(() => makeExercises(2,true,() => 1), RangeError);
});
