import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../app/engine.js';

test('Оценка позволяет исправить неверное число и сохраняет счётчик попыток', () => {
  const check = engine.newCheck(10);
  assert.equal(engine.submitCheckAnswer(check, ''), false);
  assert.equal(engine.submitCheckAnswer(check, '1e2'), false);
  assert.equal(engine.submitCheckAnswer(check, '1000'), false);
  assert.equal(engine.advanceCheck(check), false);
  assert.equal(engine.submitCheckAnswer(check, '0'), true);
  assert.deepEqual(engine.checkTotals(check), { correct: 0, incorrect: 1 });
  assert.equal(engine.submitCheckAnswer(check, '10'), true);
  assert.equal(engine.submitCheckAnswer(check, '9'), false);
  assert.equal(engine.advanceCheck(check), true);
  assert.equal(engine.advanceCheck(check), false);
  assert.equal(engine.submitCheckAnswer(check, '20'), true);
  assert.deepEqual(engine.checkTotals(check), { correct: 2, incorrect: 1 });
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
  assert.equal(engine.submitCheckAnswer(restored, '2'), true);
  assert.equal(engine.submitCheckAnswer(restored, '2'), false);
  assert.equal(engine.advanceCheck(restored), true);
});

test('Статистика сохраняет неверные попытки после исправления и перезагрузки', () => {
  const check = engine.newCheck(2);
  engine.submitCheckAnswer(check, '3');
  engine.submitCheckAnswer(check, '5');
  assert.deepEqual(engine.checkTotals(check), { correct: 0, incorrect: 2 });
  engine.submitCheckAnswer(check, '2');
  assert.deepEqual(engine.checkTotals(check), { correct: 1, incorrect: 2 });
  const restored = engine.unpackCheck(engine.packCheck(check));
  assert.deepEqual(engine.checkTotals(restored), { correct: 1, incorrect: 2 });
  assert.deepEqual(restored.mistakes, [2]);
});

test('Формат проверки v4 мигрирует, сохраняя доступные результаты', () => {
  const check = engine.newCheck(2);
  engine.submitCheckAnswer(check, '3');
  const packed = JSON.parse(engine.packCheck(check));
  packed.v = 4;
  delete packed.mistakes;
  packed.session.v = 4;
  packed.session.quizResults = packed.session.quizResults.map(({ options, ...result }) => result);
  const restored = engine.unpackCheck(JSON.stringify(packed));
  assert.ok(restored);
  assert.equal(engine.checkTotals(restored).incorrect, 1);
});

test('Повреждённое сохранение не восстанавливает ложный результат', () => {
  const packed = JSON.parse(engine.packCheck(engine.newCheck(2)));
  assert.equal(engine.unpackCheck('null'), null);
  assert.equal(engine.unpackCheck(JSON.stringify({ ...packed, answers: [null] })), null);
  assert.equal(engine.unpackCheck(JSON.stringify({ ...packed, answers: [2, 4] })), null);
  assert.equal(engine.unpackCheck(JSON.stringify({ ...packed, session: { ...packed.session, index: 2 } })), null);
});
