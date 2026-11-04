import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../app/engine.js';

test('Оценка принимает число один раз и считает верные и неверные ответы', () => {
  const check = engine.newCheck(10);
  assert.equal(engine.submitCheckAnswer(check, ''), false);
  assert.equal(engine.submitCheckAnswer(check, '1e2'), false);
  assert.equal(engine.submitCheckAnswer(check, '1000'), false);
  assert.equal(engine.advanceCheck(check), false);
  assert.equal(engine.submitCheckAnswer(check, '0'), true);
  assert.equal(engine.submitCheckAnswer(check, '10'), false);
  assert.equal(engine.advanceCheck(check), true);
  assert.equal(engine.advanceCheck(check), false);
  assert.equal(engine.submitCheckAnswer(check, '20'), true);
  assert.deepEqual(engine.checkTotals(check), { correct: 1, incorrect: 1 });
});

test('Проверка завершается после всех ответов и принимает 100', () => {
  const check = engine.newCheck(10);
  for (let i = 1; i <= 10; i++) {
    assert.equal(engine.submitCheckAnswer(check, String(i * 10)), true);
    assert.equal(engine.advanceCheck(check), true);
  }
  assert.equal(check.index, 10);
  assert.deepEqual(engine.checkTotals(check), { correct: 10, incorrect: 0 });
  assert.equal(engine.submitCheckAnswer(check, '100'), false);
  assert.equal(engine.advanceCheck(check), false);
});

test('После перезагрузки сохраняются порядок, позиция и уже оценённый ответ', () => {
  const check = engine.newCheck('all', true, () => 0);
  engine.submitCheckAnswer(check, '999');
  const restored = engine.unpackCheck(engine.packCheck(check));
  assert.deepEqual(restored, check);
  assert.equal(engine.submitCheckAnswer(restored, '1'), false);
  assert.equal(engine.advanceCheck(restored), true);
});

test('Повреждённое сохранение не восстанавливает ложный результат', () => {
  const packed = JSON.parse(engine.packCheck(engine.newCheck(2)));
  assert.equal(engine.unpackCheck('null'), null);
  assert.equal(engine.unpackCheck(JSON.stringify({ ...packed, answers: [null] })), null);
  assert.equal(engine.unpackCheck(JSON.stringify({ ...packed, answers: [2, 4] })), null);
  assert.equal(engine.unpackCheck(JSON.stringify({ ...packed, session: { ...packed.session, index: 2 } })), null);
});
