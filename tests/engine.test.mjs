import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FACTOR, makeExercises, makeAnswerOptions, newSession, newReviewSession, packSession, unpackSession, nextTable, chooseQuizAnswer, missedExerciseIds, quizTotals, newCheck, submitCheckAnswer, advanceCheck, checkTotals, packCheck, unpackCheck } from '../app/engine.js';

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
test('Варианты ответа содержат правильный ответ ровно один раз и не повторяются', () => {
  const task = makeExercises(3)[3];
  const options = makeAnswerOptions(task, () => 0.5);
  assert.equal(options.length, 3);
  assert.equal(options.filter(value => value === task.answer).length, 1);
  assert.equal(new Set(options).size, 3);
  assert.ok(options.every(value => Number.isInteger(value) && value >= 1 && value <= 100));
});
test('Варианты ответа проверяют входные данные и генератор случайных чисел', () => {
  assert.throws(() => makeAnswerOptions({ a: 2, b: 3, id: '2x3', answer: 7 }), RangeError);
  assert.throws(() => makeAnswerOptions({ a: 2, b: 3, id: '2x3', answer: 6 }, () => 1), RangeError);
});
test('У каждого задания есть три разных допустимых варианта', () => {
  let seed = 123456789;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (const task of makeExercises()) {
    const options = makeAnswerOptions(task, rng);
    assert.equal(options.length, 3);
    assert.equal(new Set(options).size, 3);
    assert.ok(options.includes(task.answer));
  }
});
test('Дистракторы используют соседние множители, когда их достаточно', () => {
  const task = makeExercises(4)[4];
  const options = makeAnswerOptions(task, () => 0);
  assert.ok(options.includes(task.answer));
  assert.ok(options.every(value => [15, 16, 20, 24, 25].includes(value)));
});
test('Ошибочно выбранные варианты остаются среди трёх вариантов', () => {
  const task = makeExercises(2)[0];
  const eliminated = [17, 19];
  const options = makeAnswerOptions(task, () => 0.5, eliminated);
  assert.equal(options.length, 3);
  assert.equal(new Set(options).size, 3);
  assert.ok(options.includes(task.answer));
  assert.ok(eliminated.every(value => options.includes(value)));
});
test('Восстановление случайного порядка и индекса после закрытия', () => {
  const s = newSession(10, true, () => 0);
  s.index = 7;
  assert.deepEqual(unpackSession(packSession(s)), s);
});
test('Режим выбора ответа сохраняется и восстанавливается', () => {
  const s = newSession(4, true, () => 0);
  s.index = 6;
  s.mode = 'quiz';
  assert.deepEqual(unpackSession(packSession(s)), s);
});
test('Сессия v2 обновляется с сохранением таблицы, порядка и позиции', () => {
  const s = newSession(4, true, () => 0);
  s.index = 6;
  const v2 = JSON.stringify({ v: 2, table: s.table, random: s.random, index: s.index, ids: s.list.map(x => x.id) });
  const migrated = unpackSession(v2);
  assert.equal(migrated.mode, 'study');
  assert.equal(migrated.table, s.table);
  assert.equal(migrated.random, s.random);
  assert.equal(migrated.index, s.index);
  assert.deepEqual(migrated.list.map(x => x.id), s.list.map(x => x.id));
});
test('Некорректный режим сессии v3 отклоняется', () => {
  const s = newSession(2);
  const packed = JSON.parse(packSession(s));
  assert.equal(unpackSession(JSON.stringify({ ...packed, mode: 'unknown' })), null);
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

test('Результат выбора ответа сохраняет ошибки по примеру и не пускает дальше без верного ответа', () => {
  const s = newSession(2);
  s.mode = 'quiz';
  const wrong = s.quizResults[0].options.find(value => value !== s.list[0].answer);
  assert.equal(chooseQuizAnswer(s, wrong), 'incorrect');
  assert.equal(chooseQuizAnswer(s, wrong), null);
  assert.equal(quizTotals(s).incorrect, 1);
  assert.equal(s.quizResults[0].solved, false);
  assert.equal(chooseQuizAnswer(s, 2), 'correct');
  assert.equal(chooseQuizAnswer(s, 4), null);
  assert.deepEqual(quizTotals(s), { correct: 1, incorrect: 1 });
  assert.deepEqual(unpackSession(packSession(s)), s);
});

test('Варианты остаются на своих местах после ошибки и перезагрузки', () => {
  const s = newSession(2, false, () => 0.5);
  s.mode = 'quiz';
  const options = [...s.quizResults[0].options];
  const wrong = options.find(value => value !== s.list[0].answer);
  assert.equal(chooseQuizAnswer(s, wrong), 'incorrect');
  assert.deepEqual(s.quizResults[0].options, options);
  assert.deepEqual(unpackSession(packSession(s)).quizResults[0].options, options);
});

test('Повтор ошибок создаёт отдельный список без дублей и сохраняет его после перезагрузки', () => {
  const tasks = makeExercises(3);
  const review = newReviewSession([tasks[1].id, tasks[4].id], 3, false, () => 0.5);
  assert.equal(review.mode, 'quiz');
  assert.equal(review.review, true);
  assert.equal(review.list.length, 2);
  assert.deepEqual(review.list.map(task => task.id), ['3x2', '3x5']);
  assert.equal(new Set(review.list.map(task => task.id)).size, 2);
  assert.deepEqual(unpackSession(packSession(review)), review);
});

test('Повтор принимает только известные примеры выбранной таблицы без повторов', () => {
  assert.throws(() => newReviewSession([], 2), RangeError);
  assert.throws(() => newReviewSession(['2x1', '2x1'], 2), RangeError);
  assert.throws(() => newReviewSession(['3x1'], 2), RangeError);
  assert.deepEqual(newReviewSession(['2x2', '2x4', '2x6'], 2, true, () => 0).list.map(task => task.id),
    ['2x4', '2x6', '2x2']);
  const normal = JSON.parse(packSession(newSession(2)));
  assert.equal(unpackSession(JSON.stringify({ ...normal, ids: ['2x1'], quizResults: [normal.quizResults[0]] })), null);
});

test('Правильный ответ в повторе убирает пример из следующего списка', () => {
  const review = newReviewSession(['2x2'], 2);
  assert.deepEqual(missedExerciseIds('review', review), ['2x2']);
  const [wrong] = review.quizResults[0].options.filter(value => value !== review.list[0].answer);
  assert.equal(chooseQuizAnswer(review, wrong), 'incorrect');
  assert.equal(chooseQuizAnswer(review, review.list[0].answer), 'correct');
  assert.deepEqual(missedExerciseIds('review', review), []);
  const quiz = newSession(2);
  quiz.mode = 'quiz';
  chooseQuizAnswer(quiz, quiz.quizResults[0].options.find(value => value !== quiz.list[0].answer));
  assert.deepEqual(missedExerciseIds('quiz', quiz), [quiz.list[0].id]);
  const check = newCheck(2);
  submitCheckAnswer(check, '1');
  assert.deepEqual(missedExerciseIds('check', check), [check.list[0].id]);
});

test('Проверка позволяет исправить неверный ответ и продолжить с неверным результатом', () => {
  const s = newCheck(2);
  assert.equal(submitCheckAnswer(s, '3'), true);
  assert.deepEqual(checkTotals(s), { correct: 0, incorrect: 1 });
  assert.equal(submitCheckAnswer(s, '2'), true);
  assert.deepEqual(checkTotals(s), { correct: 1, incorrect: 1 });
  assert.equal(s.mistakes[0], 1);
  assert.equal(advanceCheck(s), true);
  assert.equal(submitCheckAnswer(s, '5'), true);
  assert.equal(advanceCheck(s), true);
  assert.equal(checkTotals(s).incorrect, 2);
  assert.deepEqual(unpackCheck(packCheck(s)), s);
});
