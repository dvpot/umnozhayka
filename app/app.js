import {
  advanceCheck, checkTotals, chooseQuizAnswer, newCheck, newSession, nextTable,
  packCheck, packSession, quizTotals, submitCheckAnswer, unpackCheck, unpackSession
} from './engine.js';

const byId = id => document.getElementById(id);
const ui = {
  table: byId('table-select'), activity: byId('activity-select'), random: byId('random-mode'),
  lesson: byId('lesson-screen'), finish: byId('finish-screen'), progress: byId('progress-text'),
  checkControls: byId('check-controls'), checkAnswer: byId('check-answer'),
  checkScore: byId('check-score'), progressTools: byId('progress-tools'), keypad: byId('check-keypad'),
  submit: byId('submit-check'), deleteDigit: byId('delete-digit'), reset: byId('reset-button'),
  resetConfirmation: byId('reset-confirmation'), resetConfirm: byId('reset-confirm'), resetCancel: byId('reset-cancel'),
  studyControls: byId('study-controls'), quizControls: byId('quiz-controls'), options: byId('answer-options'),
  left: byId('left-number'), right: byId('right-number'), answer: byId('answer'), quizStatus: byId('quiz-status'),
  bar: byId('timer-bar'), fill: byId('timer-fill'), back: byId('back-button'), next: byId('next-button'),
  finishText: byId('finish-description'), nextTable: byId('next-table-button'), finishTitle: byId('finish-title'),
  finishScore: byId('finish-score'), finishBack: byId('finish-back-button'), card: byId('example-card'),
  settings: byId('settings-button'), settingsDialog: byId('settings-dialog'), settingsClose: byId('settings-close'),
  voice: byId('voice-toggle'), voiceSelect: byId('voice-select'), voiceStatus: byId('voice-status'),
  loading: byId('app-loading'), shell: document.querySelector('.shell')
};
const delay = 10000;
const storageKey = 'umnozhayka.session.v1';
const checkKey = 'umnozhayka.check.v1';
const activityKey = 'umnozhayka.activity.v1';
const voiceKey = 'umnozhayka.voice.v1';
const voiceChoiceKey = 'umnozhayka.voice-choice.v1';
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
let voiceEnabled = load(voiceKey) === 'true';
let selectedVoiceURI = load(voiceChoiceKey) || '';
let voices = [];
let spokenTask = '';

try {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready();
  telegram?.expand();
  telegram?.setHeaderColor?.('#6c5ce7');
} catch { /* В обычном браузере Telegram SDK необязателен. */ }

function save() {
  try {
    window.localStorage.setItem(checking ? checkKey : storageKey, checking ? packCheck(session) : packSession(session));
    window.localStorage.removeItem(checking ? storageKey : checkKey);
    window.localStorage.setItem(activityKey, checking ? 'check' : 'training');
    window.localStorage.setItem(voiceKey, String(voiceEnabled));
    window.localStorage.setItem(voiceChoiceKey, selectedVoiceURI);
  } catch { /* Хранилище может быть отключено. */ }
}
function stopTimer() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}
function speak(text) {
  if (!voiceEnabled || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  window.speechSynthesis.cancel?.();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = 0.9;
  utterance.voice = voices.find(voice => voice.voiceURI === selectedVoiceURI) || null;
  utterance.onerror = () => { ui.voiceStatus.textContent = 'Не удалось озвучить. Проверь голосовые службы устройства.'; };
  window.speechSynthesis.speak(utterance);
}
function updateVoices() {
  if (!('speechSynthesis' in window) || typeof window.speechSynthesis.speak !== 'function' ||
      typeof window.SpeechSynthesisUtterance !== 'function') {
    ui.voice.disabled = true;
    ui.voiceSelect.disabled = true;
    ui.voiceStatus.textContent = 'Это приложение не поддерживает озвучивание в данном браузере.';
    return;
  }
  try {
    voices = (typeof window.speechSynthesis.getVoices === 'function' ? window.speechSynthesis.getVoices() : [])
      .filter(voice => voice.lang?.toLowerCase().startsWith('ru'));
  } catch { voices = []; }
  const previous = selectedVoiceURI;
  ui.voiceSelect.replaceChildren(new Option('Автоматически', ''));
  for (const voice of voices) {
    ui.voiceSelect.add(new Option(`${voice.name}${voice.default ? ' · по умолчанию' : ''}`, voice.voiceURI));
  }
  if (previous && voices.some(voice => voice.voiceURI === previous)) ui.voiceSelect.value = previous;
  else { selectedVoiceURI = ''; ui.voiceSelect.value = ''; }
  ui.voiceSelect.disabled = voices.length === 0;
  ui.voiceStatus.textContent = voices.length
    ? 'Голоса предоставляет устройство; список может меняться между телефонами.'
    : 'Русские голоса не найдены. Проверь синтез речи в настройках устройства.';
}
if ('speechSynthesis' in window) {
  updateVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', updateVoices);
  window.setTimeout(updateVoices, 500);
}
function announceTask(task) {
  const key = [checking ? 'check' : session.mode, task.id].join(':');
  if (key === spokenTask) return;
  spokenTask = key;
  speak(`${task.a} умножить на ${task.b}`);
}
function updateCountdown() {
  if (revealed || checking || session.mode === 'quiz') return;
  const elapsed = delay - remaining;
  ui.fill.style.width = (100 * elapsed / delay) + '%';
  ui.bar.setAttribute('aria-valuenow', String(Math.floor(elapsed / 1000)));
}
function reveal() {
  if (checking || revealed || document.hidden || session.index >= session.list.length) return;
  stopTimer();
  revealed = true;
  ui.answer.disabled = true;
  const answer = String(session.list[session.index].answer);
  ui.answer.textContent = answer;
  ui.answer.classList.add('revealed');
  ui.answer.setAttribute('aria-label', 'Ответ: ' + answer);
  ui.answer.title = 'Ответ: ' + answer;
  ui.fill.style.width = '100%';
  ui.bar.setAttribute('aria-valuenow', '10');
  speak(answer);
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
function scoreText() {
  const { correct, incorrect } = checking ? checkTotals(session) : quizTotals(session);
  return 'Верно: ' + correct + ' · Неверно: ' + incorrect;
}
function renderAnswerOptions(task) {
  ui.options.replaceChildren();
  const result = session.quizResults[session.index];
  ui.quizStatus.textContent = result.solved ? 'Верно' : result.mistakes ? 'Неверно, попробуй другой ответ' : '';
  for (const value of result.options) {
    const button = document.createElement('button');
    button.className = 'answer-option';
    button.type = 'button';
    button.textContent = String(value);
    button.setAttribute('aria-label', String(value));
    if (value === task.answer && result.solved) button.classList.add('correct');
    if (value !== task.answer && result.mistakes > 0 && result.eliminated?.includes(value)) button.classList.add('incorrect');
    button.disabled = result.solved || Boolean(result.eliminated?.includes(value));
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const outcome = chooseQuizAnswer(session, value);
      if (outcome === 'correct') speak(randomPhrase(['Верно!', 'Отлично!', 'Супер!', 'Здорово!', 'Молодец!']));
      else if (outcome === 'incorrect') speak(randomPhrase(['Попробуй ещё раз.', 'Упс! Выбери другой ответ.', 'Ничего, попробуй снова.']));
      render();
    });
    ui.options.append(button);
  }
}
function renderDraft(submitted) {
  ui.checkAnswer.textContent = draft || '?';
  const unchanged = submitted !== undefined && draft !== '' && Number(draft) === submitted;
  ui.checkAnswer.classList.toggle('incorrect', unchanged && submitted !== session.list[session.index].answer);
  ui.checkAnswer.classList.toggle('correct', unchanged && submitted === session.list[session.index].answer);
  ui.submit.disabled = draft === '';
  ui.deleteDigit.disabled = draft === '';
}
function renderCheck(task) {
  const submitted = session.answers[session.index];
  const corrected = submitted !== undefined && submitted === task.answer;
  ui.checkScore.textContent = scoreText();
  ui.keypad.classList.toggle('hidden', corrected);
  if (draft === '' && submitted !== undefined) draft = String(submitted);
  renderDraft(submitted);
}
function render() {
  stopTimer();
  ui.resetConfirmation.classList.add('hidden');
  ui.reset.setAttribute('aria-expanded', 'false');
  ui.table.value = String(session.table);
  ui.activity.value = checking ? 'check' : session.mode;
  ui.random.setAttribute('aria-pressed', String(session.random));
  ui.random.setAttribute('aria-label', session.random ? 'Выключить случайный порядок' : 'Включить случайный порядок');
  ui.random.title = session.random ? 'Вразброс: включено' : 'По порядку';
  ui.lesson.classList.toggle('checking', checking);
  ui.lesson.classList.toggle('quiz', !checking && session.mode === 'quiz');
  ui.checkControls.classList.toggle('hidden', !checking);
  ui.keypad.classList.toggle('hidden', !checking);
  ui.studyControls.classList.toggle('hidden', checking || session.mode !== 'study');
  ui.quizControls.classList.toggle('hidden', checking || session.mode !== 'quiz');
  ui.progressTools.classList.toggle('hidden', !(checking || session.mode === 'quiz'));
  if (checking || session.mode === 'quiz') ui.checkScore.textContent = scoreText();
  ui.voice.checked = voiceEnabled;
  save();
  if (session.index >= session.list.length) {
    ui.lesson.classList.add('hidden');
    ui.finish.classList.remove('hidden');
    ui.finishTitle.textContent = checking ? 'Проверка закончена!' : 'Отличная работа!';
    ui.finishText.textContent = checking ? 'Все примеры пройдены.' : 'Все примеры пройдены. Начать ещё раз?';
    ui.finishScore.classList.toggle('hidden', !(checking || session.mode === 'quiz'));
    if (checking || session.mode === 'quiz') ui.finishScore.textContent = scoreText();
    ui.finishBack.classList.toggle('hidden', checking);
    ui.nextTable.classList.toggle('hidden', nextTable(session.table) === null);
    return;
  }
  ui.lesson.classList.remove('hidden');
  ui.finish.classList.add('hidden');
  const task = session.list[session.index];
  announceTask(task);
  ui.progress.textContent = (session.index + 1) + ' из ' + session.list.length;
  ui.left.textContent = String(task.a);
  ui.right.textContent = String(task.b);
  ui.back.classList.toggle('hidden', checking);
  ui.back.disabled = checking || session.index === 0 || (session.mode === 'quiz' && !session.quizResults[session.index].solved);
  const result = checking ? null : session.quizResults[session.index];
  const nextLabel = session.index === session.list.length - 1
    ? (checking ? 'Показать итог' : 'Завершить упражнения') : 'Следующий пример';
  ui.next.setAttribute('aria-label', nextLabel);
  ui.next.title = nextLabel;
  ui.next.disabled = checking ? session.index >= session.answers.length : session.mode === 'quiz' && !result.solved;
  if (checking) {
    renderCheck(task);
    return;
  }
  remaining = delay;
  revealed = false;
  ui.answer.classList.remove('revealed');
  ui.answer.disabled = false;
  ui.answer.textContent = '?';
  ui.answer.setAttribute('aria-label', 'Показать ответ');
  ui.answer.title = 'Нажми, чтобы узнать ответ';
  ui.fill.style.width = '0%';
  ui.bar.setAttribute('aria-valuenow', '0');
  if (session.mode === 'quiz') renderAnswerOptions(task);
  else runTimer();
}
function showReset(open) {
  ui.resetConfirmation.classList.toggle('hidden', !open);
  ui.reset.setAttribute('aria-expanded', String(open));
}
function selectActivity(value) {
  const { table, random } = session;
  checking = value === 'check';
  if (checking) {
    check = newCheck(table, random);
    session = check;
  } else {
    training = newSession(table, random);
    training.mode = value;
    session = training;
  }
  draft = '';
  spokenTask = '';
  render();
}
function start(table, random) {
  if (checking) {
    check = newCheck(table, random);
    session = check;
  } else {
    const mode = training.mode;
    training = newSession(table, random);
    training.mode = mode;
    session = training;
  }
  draft = '';
  spokenTask = '';
  render();
}
function forward() {
  if (checking) {
    if (!advanceCheck(session)) return;
    draft = '';
    render();
    (session.index === session.list.length ? ui.finishTitle : ui.checkAnswer).focus();
    return;
  }
  if (session.index >= session.list.length || (session.mode === 'quiz' && !session.quizResults[session.index].solved)) return;
  session.index++;
  render();
}
function backward() {
  if (checking || session.index <= 0 || (session.mode === 'quiz' && !session.quizResults[session.index].solved)) return;
  session.index--;
  render();
}
ui.table.addEventListener('change', () => start(ui.table.value === 'all' ? 'all' : Number(ui.table.value), session.random));
ui.activity.addEventListener('change', () => selectActivity(ui.activity.value));
ui.random.addEventListener('click', () => start(session.table, !session.random));
ui.reset.addEventListener('click', () => {
  const open = ui.resetConfirmation.classList.contains('hidden');
  showReset(open);
  if (open) ui.resetCancel.focus();
});
ui.resetConfirm.addEventListener('click', () => { start(session.table, session.random); ui.reset.focus(); });
ui.resetCancel.addEventListener('click', () => { showReset(false); ui.reset.focus(); });
ui.keypad.addEventListener('click', e => { if (e.target.dataset.digit !== undefined) editDraft(e.target.dataset.digit); });
ui.deleteDigit.addEventListener('click', () => editDraft('Backspace'));
ui.submit.addEventListener('click', submit);
ui.back.addEventListener('click', backward);
ui.next.addEventListener('click', forward);
ui.answer.addEventListener('click', reveal);
byId('again-button').addEventListener('click', () => start(session.table, session.random));
ui.nextTable.addEventListener('click', () => { const table = nextTable(session.table); if (table !== null) start(table, session.random); });
ui.finishBack.addEventListener('click', backward);
ui.settings.addEventListener('click', () => {
  ui.settingsDialog.classList.remove('hidden');
  ui.settings.setAttribute('aria-expanded', 'true');
  ui.settingsClose.focus();
});
function closeSettings() {
  ui.settingsDialog.classList.add('hidden');
  ui.settings.setAttribute('aria-expanded', 'false');
  ui.settings.focus();
}
ui.settingsClose.addEventListener('click', closeSettings);
ui.settingsDialog.addEventListener('click', e => { if (e.target === ui.settingsDialog) closeSettings(); });
ui.voice.addEventListener('change', () => {
  voiceEnabled = ui.voice.checked;
  if (!voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if (voiceEnabled && session.index < session.list.length) {
    spokenTask = '';
    announceTask(session.list[session.index]);
    if (checking && session.answers[session.index] === session.list[session.index].answer) speak(String(session.answers[session.index]));
    else if (!checking && revealed) speak(String(session.list[session.index].answer));
  }
  save();
});
ui.voiceSelect.addEventListener('change', () => {
  selectedVoiceURI = ui.voiceSelect.value;
  save();
});
function editDraft(key) {
  if (!checking || session.index >= session.list.length || session.index > session.answers.length) return;
  if (key === 'Backspace') draft = draft.slice(0, -1);
  else if (/^\d$/.test(key) && draft.length < 3) draft += key;
  renderDraft(session.answers[session.index]);
}
function randomPhrase(phrases) {
  return phrases[Math.floor(Math.random() * phrases.length)];
}
function submit() {
  if (!checking || !submitCheckAnswer(session, draft)) return;
  const task = session.list[session.index];
  if (Number(draft) === task.answer) speak(randomPhrase(['Верно!', 'Отлично!', 'Супер!', 'Здорово!', 'Молодец!']));
  else speak(randomPhrase(['Попробуй ещё раз.', 'Упс! Можно исправить.', 'Ничего, попробуй снова.']));
  render();
  if (session.answers[session.index] === task.answer) ui.next.focus();
}
document.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
  if (e.key === 'Escape' && !ui.settingsDialog.classList.contains('hidden')) { closeSettings(); return; }
  if (e.target instanceof HTMLElement && ['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (checking && (/^\d$/.test(e.key) || e.key === 'Backspace')) { e.preventDefault(); editDraft(e.key); }
  if (checking && e.key === 'Enter' && (e.target === document.body || e.target === ui.checkAnswer)) { e.preventDefault(); submit(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); backward(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
});
let startPoint = null;
ui.card.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target instanceof Element && e.target.closest('button')) return;
  startPoint = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
ui.card.addEventListener('pointerup', e => {
  if (!startPoint || e.pointerId !== startPoint.id) return;
  const dx = e.clientX - startPoint.x;
  const dy = e.clientY - startPoint.y;
  startPoint = null;
  if (Math.abs(dx) < 52 || Math.abs(dx) <= 1.25 * Math.abs(dy)) return;
  if (dx < 0) forward();
  else backward();
});
ui.card.addEventListener('pointercancel', () => { startPoint = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseTimer();
  else if (!revealed && session.index < session.list.length) {
    if (remaining <= 0) reveal();
    else { updateCountdown(); runTimer(); }
  }
});
render();
ui.shell.setAttribute('aria-hidden', 'false');
ui.loading.setAttribute('aria-hidden', 'true');
requestAnimationFrame(() => document.body.classList.add('app-ready'));
