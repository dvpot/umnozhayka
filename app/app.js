import { newSession, nextTable, packSession, unpackSession } from './engine.js';

const byId = id => document.getElementById(id);
const ui = {
  table: byId('table-select'), random: byId('random-mode'),
  lesson: byId('lesson-screen'), finish: byId('finish-screen'),
  label: byId('lesson-label'), progress: byId('progress-text'),
  left: byId('left-number'), right: byId('right-number'),
  answer: byId('answer'), meta: byId('answer-meta'),
  bar: byId('timer-bar'), fill: byId('timer-fill'),
  back: byId('back-button'), next: byId('next-button'),
  finishText: byId('finish-description'), nextTable: byId('next-table-button'),
  swipeArea: byId('swipe-area')
};
const delay = 10000;
const storageKey = 'umnozhayka.session.v1';
function storage() { try { return window.localStorage; } catch { return null; } }
function load() {
  try { return unpackSession(storage()?.getItem(storageKey)); } catch { return null; }
}
let session = load() || newSession();
let timer = null;
let startedAt = 0;
let remaining = delay;
let revealed = false;

try {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready();
  telegram?.expand();
} catch { /* В обычном браузере Telegram SDK необязателен. */ }

function save() {
  try { storage()?.setItem(storageKey, packSession(session)); } catch { /* Хранилище может быть отключено. */ }
}
function stopTimer() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}
function updateCountdown() {
  if (revealed) return;
  ui.meta.textContent = 'Ответ появится через ' + Math.max(1, Math.ceil(remaining / 1000)) + ' с';
  const elapsed = delay - remaining;
  ui.fill.style.width = (100 * elapsed / delay) + '%';
  ui.bar.setAttribute('aria-valuenow', String(Math.floor(elapsed / 1000)));
}
function reveal() {
  if (revealed || document.hidden || session.index >= session.list.length) return;
  stopTimer();
  revealed = true;
  ui.answer.textContent = String(session.list[session.index].answer);
  ui.answer.classList.add('revealed');
  ui.meta.textContent = 'Правильно! Листай дальше';
  ui.fill.style.width = '100%';
  ui.bar.setAttribute('aria-valuenow', '10');
}
function runTimer() {
  if (timer !== null || document.hidden || revealed || session.index >= session.list.length) return;
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
  ui.table.value = String(session.table);
  ui.random.checked = session.random;
  save();
  if (session.index >= session.list.length) {
    ui.lesson.classList.add('hidden');
    ui.finish.classList.remove('hidden');
    ui.finishText.textContent = session.table === 'all'
      ? 'Все 81 пример пройдены. Начать ещё раз?'
      : 'Таблица на ' + session.table + ' пройдена — все 9 примеров!';
    ui.nextTable.classList.toggle('hidden', nextTable(session.table) === null);
    return;
  }
  ui.lesson.classList.remove('hidden');
  ui.finish.classList.add('hidden');
  const task = session.list[session.index];
  ui.label.textContent = session.table === 'all' ? 'Вся таблица умножения' : 'Таблица на ' + session.table;
  ui.progress.textContent = (session.index + 1) + ' из ' + session.list.length;
  ui.left.textContent = String(task.a);
  ui.right.textContent = String(task.b);
  ui.back.disabled = session.index === 0;
  ui.next.textContent = session.index === session.list.length - 1 ? 'Готово →' : 'Дальше →';
  remaining = delay;
  revealed = false;
  ui.answer.classList.remove('revealed');
  ui.answer.textContent = '?';
  ui.fill.style.width = '0%';
  ui.bar.setAttribute('aria-valuenow', '0');
  updateCountdown();
  runTimer();
}
function start(table, random) {
  session = newSession(table, random);
  render();
}
function forward() {
  if (session.index >= session.list.length) return;
  session.index++;
  render();
}
function backward() {
  if (session.index <= 0) return;
  session.index--;
  render();
}
ui.table.addEventListener('change', () => {
  start(ui.table.value === 'all' ? 'all' : Number(ui.table.value), ui.random.checked);
});
ui.random.addEventListener('change', () => start(session.table, ui.random.checked));
ui.back.addEventListener('click', backward);
ui.next.addEventListener('click', forward);
byId('again-button').addEventListener('click', () => start(session.table, session.random));
ui.nextTable.addEventListener('click', () => {
  const table = nextTable(session.table);
  if (table !== null) start(table, session.random);
});
byId('finish-back-button').addEventListener('click', backward);
document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLElement && ['SELECT','INPUT','TEXTAREA','BUTTON'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowLeft') forward();
  if (e.key === 'ArrowRight') backward();
});
let startPoint = null;
ui.swipeArea.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target instanceof Element && e.target.closest('button,select,input,label')) return;
  startPoint = {id:e.pointerId,x:e.clientX,y:e.clientY};
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
