import {
  advanceCheck, checkTotals, makeAnswerOptions, newCheck, newSession, nextTable,
  packCheck, packSession, submitCheckAnswer, unpackCheck, unpackSession
} from './engine.js';

const byId = id => document.getElementById(id);
const ui = {
  table: byId('table-select'), random: byId('random-mode'),
  lesson: byId('lesson-screen'), finish: byId('finish-screen'),
  label: byId('lesson-label'), progress: byId('progress-text'),
  title: byId('card-title'), studyMode: byId('study-mode'), quizMode: byId('quiz-mode'),
  trainingMode: byId('training-mode'), checkMode: byId('check-mode'),
  trainingOptions: byId('training-options'), checkControls: byId('check-controls'),
  checkAnswer: byId('check-answer'), checkFeedback: byId('check-feedback'),
  checkScore: byId('check-score'), keypad: byId('check-keypad'),
  submit: byId('submit-check'), deleteDigit: byId('delete-digit'),
  reset: byId('reset-button'), resetConfirmation: byId('reset-confirmation'),
  resetConfirm: byId('reset-confirm'), resetCancel: byId('reset-cancel'),
  studyControls: byId('study-controls'), quizControls: byId('quiz-controls'),
  options: byId('answer-options'), feedback: byId('quiz-feedback'),
  left: byId('left-number'), right: byId('right-number'),
  answer: byId('answer'), meta: byId('answer-meta'),
  bar: byId('timer-bar'), fill: byId('timer-fill'),
  back: byId('back-button'), next: byId('next-button'),
  finishText: byId('finish-description'), nextTable: byId('next-table-button'),
  finishTitle: byId('finish-title'), finishScore: byId('finish-score'), finishBack: byId('finish-back-button'),
  swipeArea: byId('swipe-area')
};
const delay = 10000;
const storageKey = 'umnozhayka.session.v1';
const checkKey = 'umnozhayka.check.v1';
const activityKey = 'umnozhayka.activity.v1';
function load(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
let training = unpackSession(load(storageKey)) || newSession();
let check = unpackCheck(load(checkKey));
let checking = load(activityKey) === 'check' && check !== null;
let session = checking ? check : training;
let draft = '';
let timer = null;
let startedAt = 0;
let remaining = delay;
let revealed = false;

try {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready();
  telegram?.expand();
  telegram?.setHeaderColor?.('#6c5ce7');
} catch { /* В обычном браузере Telegram SDK необязателен. */ }

function save() {
  try {
    window.localStorage.setItem(checking ? checkKey : storageKey, checking ? packCheck(session) : packSession(session));
    window.localStorage.setItem(activityKey, checking ? 'check' : 'training');
  } catch { /* Хранилище может быть отключено. */ }
}
function stopTimer() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}
function updateCountdown() {
  if (revealed || checking || session.mode === 'quiz') return;
  ui.meta.textContent = 'Ответ появится через ' + Math.max(1, Math.ceil(remaining / 1000)) + ' с';
  const elapsed = delay - remaining;
  ui.fill.style.width = (100 * elapsed / delay) + '%';
  ui.bar.setAttribute('aria-valuenow', String(Math.floor(elapsed / 1000)));
}
function reveal() {
  if (checking || revealed || document.hidden || session.index >= session.list.length) return;
  stopTimer();
  revealed = true;
  const answer = String(session.list[session.index].answer);
  ui.answer.textContent = answer;
  ui.answer.classList.add('revealed');
  ui.answer.setAttribute('aria-label', 'Ответ: ' + answer);
  ui.answer.title = 'Ответ: ' + answer;
  ui.meta.textContent = 'Ответ открыт — листай дальше';
  ui.fill.style.width = '100%';
  ui.bar.setAttribute('aria-valuenow', '10');
}
function runTimer() {
  if (timer !== null || document.hidden || revealed || checking || session.mode === 'quiz' || session.index >= session.list.length) return;
  startedAt = performance.now();
  timer = setInterval(() => {
    const now = performance.now();
    remaining = Math.max(0, remaining - (now - startedAt));
    startedAt = now;
    updateCountdown();
    if (remaining <= 0) reveal();
  }, 80);
}
function pauseTimer() {
  if (timer === null) return;
  remaining = Math.max(0, remaining - (performance.now() - startedAt));
  stopTimer();
}
function render() {
  stopTimer();
  showReset(false);
  ui.table.value = String(session.table);
  ui.random.setAttribute('aria-pressed', String(session.random));
  ui.random.setAttribute('aria-label', session.random ? 'Выключить случайный порядок' : 'Включить случайный порядок');
  ui.random.title = session.random ? 'Вразброс: включено' : 'По порядку';
  ui.trainingMode.setAttribute('aria-pressed', String(!checking));
  ui.checkMode.setAttribute('aria-pressed', String(checking));
  ui.lesson.classList.toggle('checking', checking);
  ui.trainingOptions.classList.toggle('hidden', checking);
  ui.checkControls.classList.toggle('hidden', !checking);
  ui.checkScore.classList.toggle('hidden', !checking);
  ui.studyMode.setAttribute('aria-pressed', String(session.mode === 'study'));
  ui.quizMode.setAttribute('aria-pressed', String(session.mode === 'quiz'));
  ui.studyControls.classList.toggle('hidden', checking || session.mode !== 'study');
  ui.quizControls.classList.toggle('hidden', checking || session.mode !== 'quiz');
  ui.keypad.classList.add('hidden');
  save();
  if (session.index >= session.list.length) {
    ui.lesson.classList.add('hidden');
    ui.finish.classList.remove('hidden');
    ui.finishTitle.textContent = checking ? 'Проверка закончена!' : 'Отличная работа!';
    ui.finishText.textContent = checking ? 'Решено примеров: ' + session.list.length : session.table === 'all'
      ? 'Все 100 примеров пройдены. Начать ещё раз?'
      : 'Таблица на ' + session.table + ' пройдена — все 10 примеров!';
    ui.finishScore.classList.toggle('hidden', !checking);
    if (checking) ui.finishScore.textContent = scoreText();
    ui.finishBack.classList.toggle('hidden', checking);
    ui.nextTable.classList.toggle('hidden', nextTable(session.table) === null);
    return;
  }
  ui.lesson.classList.remove('hidden');
  ui.finish.classList.add('hidden');
  const task = session.list[session.index];
  ui.title.textContent = !checking && session.mode === 'quiz' ? 'Выбери правильный ответ' : 'Сколько получится?';
  ui.label.textContent = session.table === 'all' ? 'Вся таблица умножения' : 'Таблица на ' + session.table;
  ui.progress.textContent = (session.index + 1) + ' из ' + session.list.length;
  ui.left.textContent = String(task.a);
  ui.right.textContent = String(task.b);
  ui.back.classList.toggle('hidden', checking);
  ui.back.disabled = checking || session.index === 0;
  const nextLabel = session.index === session.list.length - 1
    ? (checking ? 'Показать итог' : 'Завершить упражнения')
    : 'Следующий пример';
  ui.next.setAttribute('aria-label', nextLabel);
  ui.next.title = nextLabel;
  ui.next.disabled = checking && session.index === session.answers.length;
  if (checking) {
    renderCheck(task);
    return;
  }
  remaining = delay;
  revealed = false;
  ui.answer.classList.remove('revealed');
  ui.answer.textContent = '?';
  ui.answer.setAttribute('aria-label', 'Показать ответ');
  ui.answer.title = 'Нажми, чтобы узнать ответ';
  ui.fill.style.width = '0%';
  ui.bar.setAttribute('aria-valuenow', '0');
  updateCountdown();
  if (session.mode === 'quiz') renderAnswerOptions(task);
  else runTimer();
}
function renderAnswerOptions(task) {
  ui.options.replaceChildren();
  ui.feedback.textContent = '';
  ui.feedback.classList.remove('retry');
  for (const value of makeAnswerOptions(task)) {
    const button = document.createElement('button');
    button.className = 'answer-option';
    button.type = 'button';
    button.textContent = String(value);
    button.setAttribute('aria-label', String(value));
    button.addEventListener('click', () => {
      if (button.disabled) return;
      if (value === task.answer) {
        ui.feedback.textContent = 'Верно! Перелистни дальше.';
        ui.feedback.classList.remove('retry');
        for (const option of ui.options.children) option.disabled = true;
      } else {
        ui.feedback.textContent = 'Попробуй ещё раз.';
        ui.feedback.classList.add('retry');
      }
    });
    ui.options.append(button);
  }
}
function scoreText() {
  const { correct, incorrect } = checkTotals(session);
  return 'Верно: ' + correct + ' · Неверно: ' + incorrect;
}
function renderCheck(task) {
  const submitted = session.answers[session.index];
  ui.checkScore.textContent = scoreText();
  ui.keypad.classList.toggle('hidden', submitted !== undefined);
  if (submitted === undefined) {
    ui.checkFeedback.textContent = '';
    renderDraft();
  } else {
    ui.checkAnswer.textContent = String(submitted);
    ui.checkFeedback.textContent = submitted === task.answer ? 'Верно!' : 'Правильный ответ: ' + task.answer;
  }
}
function renderDraft() {
  ui.checkAnswer.textContent = draft || '?';
  ui.submit.disabled = draft === '';
  ui.deleteDigit.disabled = draft === '';
}
function editDraft(key) {
  if (!checking || session.index !== session.answers.length || session.index >= session.list.length) return;
  if (key === 'Backspace') draft = draft.slice(0, -1);
  else if (draft.length < 3) draft += key;
  renderDraft();
}
function submit() {
  if (!checking || !submitCheckAnswer(session, draft)) return;
  draft = '';
  render();
  ui.next.focus();
}
function showReset(open) {
  ui.resetConfirmation.classList.toggle('hidden', !open);
  ui.reset.setAttribute('aria-expanded', String(open));
}
function selectActivity(nextChecking) {
  if (checking === nextChecking) return;
  if (nextChecking && !check) check = newCheck(training.table, training.random);
  checking = nextChecking;
  session = checking ? check : training;
  draft = '';
  render();
}
function start(table, random) {
  if (checking) {
    check = newCheck(table, random);
    session = check;
  } else {
    training = { ...newSession(table, random), mode: training.mode };
    session = training;
  }
  draft = '';
  render();
}
function forward() {
  if (checking) {
    if (!advanceCheck(session)) return;
    render();
    (session.index === session.list.length ? ui.finishTitle : ui.checkAnswer).focus();
    return;
  }
  if (session.index >= session.list.length) return;
  session.index++;
  render();
}
function backward() {
  if (checking || session.index <= 0) return;
  session.index--;
  render();
}
ui.table.addEventListener('change', () => {
  start(ui.table.value === 'all' ? 'all' : Number(ui.table.value), session.random);
});
ui.random.addEventListener('click', () => start(session.table, !session.random));
ui.trainingMode.addEventListener('click', () => selectActivity(false));
ui.checkMode.addEventListener('click', () => selectActivity(true));
ui.reset.addEventListener('click', () => {
  const open = ui.resetConfirmation.classList.contains('hidden');
  showReset(open);
  if (open) ui.resetCancel.focus();
});
ui.resetConfirm.addEventListener('click', () => {
  start(session.table, session.random);
  ui.reset.focus();
});
ui.resetCancel.addEventListener('click', () => {
  showReset(false);
  ui.reset.focus();
});
ui.keypad.addEventListener('click', e => {
  if (e.target.dataset.digit !== undefined) editDraft(e.target.dataset.digit);
});
ui.deleteDigit.addEventListener('click', () => editDraft('Backspace'));
ui.submit.addEventListener('click', submit);
ui.studyMode.addEventListener('click', () => {
  if (session.mode !== 'study') { session.mode = 'study'; render(); }
});
ui.quizMode.addEventListener('click', () => {
  if (session.mode !== 'quiz') { session.mode = 'quiz'; render(); }
});
ui.back.addEventListener('click', backward);
ui.next.addEventListener('click', forward);
ui.answer.addEventListener('click', reveal);
byId('again-button').addEventListener('click', () => start(session.table, session.random));
ui.nextTable.addEventListener('click', () => {
  const table = nextTable(session.table);
  if (table !== null) start(table, session.random);
});
ui.finishBack.addEventListener('click', backward);
document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
  if (e.target instanceof HTMLElement && ['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (checking && (/^\d$/.test(e.key) || e.key === 'Backspace')) {
    e.preventDefault();
    editDraft(e.key);
  }
  if (checking && e.key === 'Enter' && (e.target === document.body || e.target === ui.checkAnswer)) {
    e.preventDefault();
    submit();
  }
  if (e.key === 'ArrowLeft') { e.preventDefault(); backward(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
});
let startPoint = null;
ui.swipeArea.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target instanceof Element && e.target.closest('button,select,input,label')) return;
  startPoint = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
ui.swipeArea.addEventListener('pointerup', e => {
  if (!startPoint || e.pointerId !== startPoint.id) return;
  const dx = e.clientX - startPoint.x;
  const dy = e.clientY - startPoint.y;
  startPoint = null;
  if (Math.abs(dx) < 52 || Math.abs(dx) <= 1.25 * Math.abs(dy)) return;
  if (dx < 0) forward();
  else backward();
});
ui.swipeArea.addEventListener('pointercancel', () => { startPoint = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseTimer();
  else if (!revealed && session.index < session.list.length) {
    if (remaining <= 0) reveal();
    else { updateCountdown(); runTimer(); }
  }
});
render();
