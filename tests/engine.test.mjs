import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FACTOR, makeExercises, newSession, packSession, unpackSession, nextTable } from '../app/engine.js';

test('Все: 100 уникальных примеров от 1×1 до 10×10', () => {
  const list = makeExercises();
  assert.equal(MAX_FACTOR, 10);
  assert.equal(list.length, 100);
  assert.equal(new Set(list.map(x => x.id)).size, 100);
  assert.deepEqual(list[0], { a:1, b:1, id:'1x1', answer:1 });
  assert.deepEqual(list[99], { a:10, b:10, id:'10x10', answer:100 });
});
test('Отдельные таблицы: все 10 примеров по порядку', () => {
  for (let n = 1; n <= 10; n++) {
    const list = makeExercises(n);
    assert.equal(list.length, 10);
    assert.ok(list.every((x,i) => x.a === n && x.b === i + 1 && x.answer === n*(i + 1)));
  }
});
test('Перемешивание без повторений и пропусков', () => {
  const ordered = makeExercises('all');
  const random = makeExercises('all', true, () => 0);
  assert.deepEqual(random.map(x => x.id).sort(), ordered.map(x => x.id).sort());
  assert.notDeepEqual(random.map(x => x.id), ordered.map(x => x.id));
});
test('Восстановление случайного порядка и индекса после закрытия', () => {
  const s = newSession(10, true, () => 0);
  s.index = 7;
  assert.deepEqual(unpackSession(packSession(s)), s);
});
test('Старые сессии ×1…×9 обновляются без исключения', () => {
  const legacy = { v:1, table:4, random:true, index:5, ids: Array.from({length:9}, (_,i) => `4x${i+1}`) };
  const migrated = unpackSession(JSON.stringify(legacy));
  assert.equal(migrated.table, 4);
  assert.equal(migrated.random, true);
  assert.equal(migrated.index, 0);
  assert.equal(migrated.list.length, 10);
});
test('Некорректный localStorage игнорируется', () => {
  const s = JSON.parse(packSession(newSession(3)));
  assert.equal(unpackSession('bad'), null);
  assert.equal(unpackSession(JSON.stringify({...s,index:11})), null);
  assert.equal(unpackSession(JSON.stringify({...s,ids:Array(10).fill('3x1')})), null);
  assert.equal(unpackSession(JSON.stringify({...s,ids:s.ids.slice().reverse()})), null);
  assert.equal(unpackSession(JSON.stringify({...s,table:11})), null);
  assert.equal(unpackSession(JSON.stringify({...s,v:99})), null);
});
test('Следующая таблица до ×10 и защита параметров', () => {
  assert.equal(nextTable(1), 2);
  assert.equal(nextTable(9), 10);
  assert.equal(nextTable(10), null);
  assert.equal(nextTable('all'), null);
  assert.throws(() => makeExercises(11), RangeError);
  assert.throws(() => makeExercises(2,true,() => 1), RangeError);
});
