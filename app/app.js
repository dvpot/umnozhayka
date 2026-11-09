import {
  MAX_FACTOR, advanceCheck, checkTotals, chooseQuizAnswer, mergeTableProgress, newCheck, newSession, nextTable,
  packCheck, packSession, quizTotals, recordTableProgress, submitCheckAnswer, unpackCheck, unpackSession,
  unpackTableProgress
} from './engine.js';
import { spokenVoiceName } from './voice-name.js';

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
  finishScore: byId('finish-score'), finishSync: byId('finish-sync'), finishBack: byId('finish-back-button'), card: byId('example-card'),
  settings: byId('settings-button'), settingsDialog: byId('settings-dialog'), settingsClose: byId('settings-close'),
  home: byId('home-view'), lessonHeader: byId('lesson-header'), navHome: byId('nav-home'),
  navMastery: byId('nav-mastery'), mastery: byId('mastery-view'), masteryScope: byId('mastery-scope'),
  masteryRefresh: byId('mastery-refresh'), masteryImport: byId('mastery-import'),
  masteryConfirmText: byId('mastery-confirm-text'), masteryTitle: byId('mastery-title'), masteryCount: byId('mastery-count'), masteryScores: byId('mastery-scores'),
  masteryClear: byId('mastery-clear'), masteryConfirmation: byId('mastery-confirmation'),
  masteryConfirm: byId('mastery-confirm'), masteryCancel: byId('mastery-cancel'), masteryStatus: byId('mastery-status'),
  voice: byId('voice-toggle'), voiceSelect: byId('voice-select'),
  loading: byId('app-loading'), shell: document.querySelector('.shell')
};
const delay = 10000;
const telegram = window.Telegram?.WebApp;
const accountMode = Boolean(telegram?.initData);
// Этот ID только разделяет локальные упражнения. Сервер использует проверенный контекст Telegram.
const localAccountId = telegram?.initDataUnsafe?.user?.id;
const activeScope = !accountMode ? '' : Number.isSafeInteger(localAccountId) && localAccountId > 0
  ? `.telegram.${localAccountId}` : null;
let homeOpen = true;
let accountScores = null;
let pendingScores = null;
let accountQueue = Promise.resolve();
let accountJobs = 0;
const storageKey = 'umnozhayka.session.v1';
const checkKey = 'umnozhayka.check.v1';
const activityKey = 'umnozhayka.activity.v1';
const masteryKey = 'umnozhayka.table-progress.v1';
const voiceKey = 'umnozhayka.voice.v1';
const voiceChoiceKey = 'umnozhayka.voice-choice.v1';
function load(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function loadActive(key) {
  return activeScope === null ? null : load(key + activeScope);
}
let training = unpackSession(loadActive(storageKey)) || newSession();
let check = unpackCheck(loadActive(checkKey));
let checking = loadActive(activityKey) === 'check' && check !== null;
let session = checking ? check : training;
let draft = '';
let draftEdited = false;
let timer = null;
let startedAt = 0;
let remaining = delay;
let revealed = false;
let voiceEnabled = load(voiceKey) === 'true';
const savedVoiceURI = load(voiceChoiceKey);
let selectedVoiceURI = savedVoiceURI === 'umnozhayka:recorded' ? '' : (savedVoiceURI || '');
let voices = [];
let spokenTask;
let skipTaskSpeech = false;

try {
  telegram?.ready();
  telegram?.expand();
  telegram?.setHeaderColor?.('#6c5ce7');
} catch { /* В обычном браузере Telegram SDK необязателен. */ }

function save() {
  try {
    if (activeScope !== null) {
      window.localStorage.setItem((checking ? checkKey : storageKey) + activeScope, checking ? packCheck(session) : packSession(session));
      window.localStorage.removeItem((checking ? storageKey : checkKey) + activeScope);
      window.localStorage.setItem(activityKey + activeScope, checking ? 'check' : 'training');
    }
    window.localStorage.setItem(voiceKey, String(voiceEnabled));
    window.localStorage.setItem(voiceChoiceKey, selectedVoiceURI);
  } catch { /* Хранилище может быть отключено. */ }
}
function localTableProgress() {
  return unpackTableProgress(load(masteryKey));
}
function hasScores(scores) {
  return scores?.some(score => score !== null) ?? false;
}
function removeLocalProgress() {
  try {
    window.localStorage.removeItem(masteryKey);
    return true;
  } catch {
    return false;
  }
}
function callTableProgress(input) {
  return new Promise((resolve, reject) => {
    telegram.Serverless.call('tableProgress', input, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      const scores = result?.scores;
      if (!Array.isArray(scores) || scores.length !== MAX_FACTOR ||
          !scores.every(score => score === null || (Number.isInteger(score) && score >= 0 && score <= MAX_FACTOR))) {
        reject(new Error('Некорректный ответ сервера.'));
        return;
      }
      resolve(scores);
    });
  });
}
function queueAccountProgress(action, scores, onSuccess, onFailure) {
  accountJobs++;
  renderTableProgress();
  accountQueue = accountQueue.then(async () => {
    try {
      accountScores = await callTableProgress(scores ? { action, scores } : { action });
      ui.masteryStatus.textContent = onSuccess?.() ?? (pendingScores ? 'Есть результат, ожидающий сохранения.' : '');
    } catch {
      ui.masteryStatus.textContent = 'Не удалось связаться с хранилищем Telegram. Попробуй ещё раз.';
      onFailure?.();
    } finally {
      accountJobs--;
      renderTableProgress();
    }
  });
}
function syncCompletedCheck() {
  const snapshot = pendingScores;
  if (!snapshot) return;
  const finished = session;
  const setFinishStatus = message => {
    if (session === finished && checking && session.index === session.list.length) ui.finishSync.textContent = message;
  };
  setFinishStatus('Сохраняем прогресс в аккаунте…');
  queueAccountProgress('merge', snapshot, () => {
    if (pendingScores === snapshot) pendingScores = null;
    setFinishStatus('Прогресс сохранён в аккаунте.');
    return 'Прогресс сохранён в аккаунте.';
  }, () => {
    setFinishStatus('Прогресс пока не сохранён. Открой «Мой прогресс» и повтори сохранение.');
  });
}
function saveTableProgress() {
  if (!session.tracksTableProgress) return;
  if (accountMode) {
    const best = pendingScores ?? unpackTableProgress(null);
    pendingScores = recordTableProgress(best, session);
    syncCompletedCheck();
    return;
  }
  try {
    const best = localTableProgress();
    const updated = recordTableProgress(best, session);
    if (updated !== best) window.localStorage.setItem(masteryKey, JSON.stringify(updated));
    ui.masteryStatus.textContent = '';
  } catch {
    ui.masteryStatus.textContent = 'Не удалось сохранить прогресс на этом устройстве.';
  }
}
function renderTableProgress() {
  const local = localTableProgress();
  const best = accountMode ? (accountScores ?? unpackTableProgress(null)) : local;
  const mastered = best.filter(score => score === MAX_FACTOR).length;
  const busy = accountJobs > 0;
  ui.masteryScope.textContent = accountMode ? 'Прогресс аккаунта Telegram' : 'Прогресс на этом устройстве';
  ui.masteryCount.textContent = accountMode && !accountScores
    ? (busy ? 'Загружаем прогресс…' : 'Прогресс аккаунта ещё не загружен.')
    : `Таблиц без ошибок: ${mastered} из ${MAX_FACTOR}`;
  const rows = best.map((score, i) => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = `×${i + 1}`;
    value.textContent = score === null ? '—' : `${score}/${MAX_FACTOR}`;
    row.append(label, value);
    return row;
  });
  ui.masteryScores.replaceChildren(...rows);
  ui.masteryRefresh.classList.toggle('hidden', !accountMode);
  ui.masteryRefresh.textContent = pendingScores ? 'Повторить сохранение' : 'Обновить';
  ui.masteryRefresh.disabled = busy;
  ui.masteryImport.classList.toggle('hidden', !accountMode || !hasScores(local));
  ui.masteryImport.disabled = busy;
  ui.masteryClear.disabled = busy || !(hasScores(best) || hasScores(local) || pendingScores);
  ui.masteryConfirm.disabled = busy;
  ui.masteryConfirmText.textContent = accountMode
    ? 'Удалить статистику аккаунта на всех устройствах и старую копию на этом устройстве?'
    : 'Удалить все результаты по таблицам на этом устройстве?';
}
function showMasteryClear(open) {
  ui.masteryConfirmation.classList.toggle('hidden', !open);
  ui.masteryClear.setAttribute('aria-expanded', String(open));
}
function stopTimer() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}
function getSystemVoice() {
  return voices.find(voice => voice.voiceURI === selectedVoiceURI)
    || voices.find(voice => voice.default)
    || voices[0]
    || null;
}
function speak(text, { settings = false } = {}) {
  if (!settings && (!voiceEnabled || skipTaskSpeech)) return;
  const voice = getSystemVoice();
  if (!voice) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel?.();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice.lang;
    utterance.rate = 0.9;
    utterance.voice = voice;
    synth.speak(utterance);
  } catch { /* Голос может стать недоступен во время занятия. */ }
}
function updateVoices() {
  const synth = window.speechSynthesis;
  try {
    voices = typeof synth?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function'
      ? synth.getVoices().filter(voice => /^ru(?:-|$)/i.test(voice.lang))
      : [];
  } catch { voices = []; }
  const available = voices.length > 0;
  ui.voiceSelect.replaceChildren(new Option(available ? 'Автоматически' : 'Недоступно', ''));
  for (const voice of voices) ui.voiceSelect.add(new Option(voice.name, voice.voiceURI));
  ui.voiceSelect.value = voices.some(voice => voice.voiceURI === selectedVoiceURI) ? selectedVoiceURI : '';
  ui.voiceSelect.disabled = !available;
  ui.voice.disabled = !available;
  ui.voice.checked = available && voiceEnabled;
}
updateVoices();
window.speechSynthesis?.addEventListener?.('voiceschanged', updateVoices);
window.setTimeout(updateVoices, 500);

function announceTask(task) {
  const key = [checking ? 'check' : session.mode, task.id].join(':');
  if (key === spokenTask) return;
  const firstRender = spokenTask === undefined;
  spokenTask = key;
  skipTaskSpeech = false;
  if (firstRender) return;
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
  if (!homeOpen || timer !== null || document.hidden || revealed || checking || session.mode === 'quiz' || session.index >= session.list.length) return;
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
  const graded = submitted !== undefined && !draftEdited;
  ui.checkAnswer.classList.toggle('incorrect', graded && submitted !== session.list[session.index].answer);
  ui.checkAnswer.classList.toggle('correct', graded && submitted === session.list[session.index].answer);
  ui.submit.disabled = draft === '';
  ui.deleteDigit.disabled = draft === '';
}
function renderCheck(task) {
  const submitted = session.answers[session.index];
  const corrected = submitted !== undefined && submitted === task.answer;
  ui.checkScore.textContent = scoreText();
  ui.keypad.classList.toggle('hidden', corrected);
  if (draft === '' && submitted !== undefined) draft = String(submitted);
  draftEdited = false;
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
  ui.finishSync.textContent = '';
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
    if (session.index === session.list.length) {
      ui.finishSync.textContent = '';
      saveTableProgress();
    }
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
function selectView(showHome) {
  if (showHome === homeOpen) return;
  homeOpen = showHome;
  ui.home.classList.toggle('hidden', !showHome);
  ui.lessonHeader.classList.toggle('hidden', !showHome);
  ui.mastery.classList.toggle('hidden', showHome);
  (showHome ? ui.navMastery : ui.navHome).removeAttribute('aria-current');
  (showHome ? ui.navHome : ui.navMastery).setAttribute('aria-current', 'page');
  showMasteryClear(false);
  window.scrollTo(0, 0);
  if (showHome) {
    runTimer();
  } else {
    pauseTimer();
    if (accountMode) queueAccountProgress('read');
    else renderTableProgress();
    ui.masteryTitle.focus();
  }
}
ui.navHome.addEventListener('click', () => selectView(true));
ui.navMastery.addEventListener('click', () => selectView(false));
ui.settings.addEventListener('click', () => {
  ui.shell.inert = true;
  ui.settingsDialog.classList.remove('hidden');
  ui.settings.setAttribute('aria-expanded', 'true');
  ui.settingsClose.focus();
});
function closeSettings() {
  ui.shell.inert = false;
  ui.settingsDialog.classList.add('hidden');
  ui.settings.setAttribute('aria-expanded', 'false');
  ui.settings.focus();
}
ui.settingsClose.addEventListener('click', closeSettings);
ui.settingsDialog.addEventListener('click', e => { if (e.target === ui.settingsDialog) closeSettings(); });
ui.masteryClear.addEventListener('click', () => {
  const open = ui.masteryConfirmation.classList.contains('hidden');
  showMasteryClear(open);
  if (open) ui.masteryCancel.focus();
});
ui.masteryCancel.addEventListener('click', () => {
  showMasteryClear(false);
  ui.masteryClear.focus();
});
ui.masteryRefresh.addEventListener('click', () => {
  if (pendingScores) syncCompletedCheck();
  else queueAccountProgress('read');
});
ui.masteryImport.addEventListener('click', () => {
  const local = localTableProgress();
  if (!hasScores(local)) return;
  queueAccountProgress('merge', local, () => removeLocalProgress()
    ? 'Результаты перенесены в аккаунт.'
    : 'Результаты перенесены, но локальную копию удалить не удалось.');
});
ui.masteryConfirm.addEventListener('click', () => {
  showMasteryClear(false);
  ui.masteryTitle.focus();
  if (accountMode) {
    const discarded = pendingScores;
    pendingScores = null;
    queueAccountProgress('clear', null, () => {
      if (!pendingScores) ui.finishSync.textContent = '';
      return removeLocalProgress()
        ? 'Статистика аккаунта удалена.'
        : 'Статистика аккаунта удалена. Локальную копию удалить не удалось.';
    }, () => {
      if (discarded) pendingScores = pendingScores ? mergeTableProgress(pendingScores, discarded) : discarded;
    });
  } else {
    ui.masteryStatus.textContent = removeLocalProgress()
      ? 'Статистика удалена.'
      : 'Не удалось удалить статистику на этом устройстве.';
    renderTableProgress();
  }
});
ui.voice.addEventListener('change', () => {
  voiceEnabled = ui.voice.checked;
  skipTaskSpeech = true;
  save();
  speak(voiceEnabled ? 'Звук включён.' : 'Звук выключен.', { settings: true });
});
ui.voiceSelect.addEventListener('change', () => {
  selectedVoiceURI = ui.voiceSelect.value;
  save();
  const name = spokenVoiceName(getSystemVoice()?.name);
  speak(name ? `Привет, я ${name}.` : 'Привет!', { settings: true });
});
function editDraft(key) {
  if (!checking || session.index >= session.list.length || session.index > session.answers.length) return;
  const submitted = session.answers[session.index];
  if (submitted === session.list[session.index].answer) return;
  if (key === 'Backspace') {
    draft = draft.slice(0, -1);
  } else if (/^\d$/.test(key)) {
    if (submitted !== undefined && !draftEdited) draft = key;
    else if (draft.length < 3) draft += key;
    else return;
  } else {
    return;
  }
  draftEdited = true;
  renderDraft(submitted);
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
  if (!ui.settingsDialog.classList.contains('hidden')) {
    if (e.key === 'Escape') closeSettings();
    return;
  }
  if (!homeOpen) return;
  if (e.target instanceof HTMLElement && ['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (checking && (/^\d$/.test(e.key) || e.key === 'Backspace')) { e.preventDefault(); editDraft(e.key); }
  if (checking && e.key === 'Enter' && (e.target === document.body || e.target === ui.checkAnswer)) { e.preventDefault(); submit(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); backward(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
});
let startPoint = null;
let suppressSwipeClick = false;
let swipeClickTimer = null;
ui.card.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  clearTimeout(swipeClickTimer);
  swipeClickTimer = null;
  suppressSwipeClick = false;
  startPoint = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
ui.card.addEventListener('pointerup', e => {
  if (!startPoint || e.pointerId !== startPoint.id) return;
  const dx = e.clientX - startPoint.x;
  const dy = e.clientY - startPoint.y;
  startPoint = null;
  if (Math.abs(dx) < 52 || Math.abs(dx) <= 1.25 * Math.abs(dy)) return;
  suppressSwipeClick = true;
  swipeClickTimer = window.setTimeout(() => { suppressSwipeClick = false; }, 1000);
  e.preventDefault();
  if (dx < 0) forward();
  else backward();
});
ui.card.addEventListener('click', e => {
  if (!suppressSwipeClick || e.detail === 0) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  clearTimeout(swipeClickTimer);
  swipeClickTimer = null;
  suppressSwipeClick = false;
}, true);
ui.card.addEventListener('pointercancel', () => { startPoint = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseTimer();
  else if (homeOpen && !revealed && session.index < session.list.length) {
    if (remaining <= 0) reveal();
    else { updateCountdown(); runTimer(); }
  }
});
render();
ui.shell.setAttribute('aria-hidden', 'false');
ui.loading.setAttribute('aria-hidden', 'true');
requestAnimationFrame(() => document.body.classList.add('app-ready'));
