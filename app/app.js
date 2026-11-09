import {
  MAX_FACTOR, advanceCheck, checkTotals, chooseQuizAnswer, newCheck, newSession, nextTable,
  packCheck, packSession, quizTotals, submitCheckAnswer, unpackCheck, unpackSession
} from './engine.js';
import { createAccountSync, emptyTotals, newPlayId, validTotals } from './account-sync.js';
import { countMarks, exerciseProgress, latestScores, validMarks } from './live-progress.js';
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
  finishScore: byId('finish-score'), finishBack: byId('finish-back-button'), card: byId('example-card'),
  settings: byId('settings-button'), settingsDialog: byId('settings-dialog'), settingsClose: byId('settings-close'),
  home: byId('home-view'), lessonHeader: byId('lesson-header'), navHome: byId('nav-home'),
  navMastery: byId('nav-mastery'), mastery: byId('mastery-view'),
  masteryMode: byId('mastery-mode'), masteryTitle: byId('mastery-title'),
  masteryScores: byId('mastery-scores'), masteryContent: byId('mastery-content'),
  masteryStatus: byId('mastery-status'), gameSync: byId('game-sync'),
  totals: ['study', 'quiz', 'check', 'solved'].map(id => byId('total-' + id)),
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
let progressLoading = false;
let syncNotice = '';
const storageKey = 'umnozhayka.session.v1';
const checkKey = 'umnozhayka.check.v1';
const activityKey = 'umnozhayka.activity.v1';
const gameKey = 'umnozhayka.game.v1';
const voiceKey = 'umnozhayka.voice.v1';
const voiceChoiceKey = 'umnozhayka.voice-choice.v1';
function load(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function loadActive(key) {
  return activeScope === null ? null : load(key + activeScope);
}
function storeActive(key, value) {
  if (activeScope === null) return false;
  try {
    window.localStorage.setItem(key + activeScope, JSON.stringify(value));
    return true;
  } catch { return false; }
}
function parseStored(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}
const livePrefix = activeScope === null ? null : 'umnozhayka.live-round.v1' + activeScope + '.';
const roundPrefix = activeScope === null ? null : 'umnozhayka.round.v1' + activeScope + '.';
function loadRounds() {
  if (!roundPrefix) return [];
  const rounds = [];
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(livePrefix)) {
        const record = parseStored(load(key));
        if (record?.key === key.slice(livePrefix.length) && validMarks(record) &&
            typeof record.roundId === 'string' && /^[a-f0-9]{32}$/.test(record.roundId)) rounds.push(record);
      } else if (key.startsWith(roundPrefix)) {
        const roundId = key.slice(roundPrefix.length);
        const totals = parseStored(load(key));
        if (/^[a-f0-9]{32}$/.test(roundId) && validTotals(totals)) rounds.push({ roundId, totals });
      }
    }
  } catch { /* Память может быть отключена. */ }
  return rounds;
}
function persistRound(round) {
  if (!roundPrefix) return;
  try {
    window.localStorage.setItem(livePrefix + round.key, JSON.stringify(round));
  } catch { /* Память может быть отключена. */ }
}
function removeRound(roundId) {
  if (!roundPrefix) return;
  try {
    window.localStorage.removeItem(livePrefix + roundId);
    window.localStorage.removeItem(roundPrefix + roundId);
  } catch { /* Повтор отправки безопасен. */ }
}
const gameCache = parseStored(loadActive(gameKey));
let gameSavedLocally = Boolean(gameCache?.state);
let totals = validTotals(gameCache?.totals) ? gameCache.totals : (accountMode ? null : emptyTotals());
let latest = gameCache?.latest ?? { quiz: Array(10).fill(null), check: Array(10).fill(null) };
let marks = null;
let checking = loadActive(activityKey) === 'check';
const legacySession = checking ? unpackCheck(loadActive(checkKey)) : unpackSession(loadActive(storageKey));
let session = legacySession || newSession();
let roundId = newPlayId();
if (!session.answers) checking = false;
let draft = '';
let draftEdited = false;
let seen = new Set();
let counted = session.index === session.list.length;
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

function snapshot() {
  return {
    v: 1, activity: checking ? 'check' : session.mode, roundId,
    game: JSON.parse(checking ? packCheck(session) : packSession(session)),
    progress: marks,
    draft: checking && draftEdited ? draft : null,
    seen: [...seen], revealed, counted, voiceEnabled, voiceURI: selectedVoiceURI
  };
}
function restore(state) {
  if (state?.v !== 1 || typeof state.roundId !== 'string' || !/^[a-f0-9]{32}$/.test(state.roundId) || typeof state.voiceEnabled !== 'boolean' || typeof state.voiceURI !== 'string' ||
      typeof state.counted !== 'boolean' || typeof state.revealed !== 'boolean' || !Array.isArray(state.seen) ||
      (state.draft !== null && (typeof state.draft !== 'string' || !/^\d{0,3}$/.test(state.draft)))) return false;
  const isCheck = state.activity === 'check';
  const data = JSON.stringify(state.game);
  const restored = isCheck ? unpackCheck(data) : unpackSession(data);
  if (!restored || (!isCheck && state.activity !== restored.mode)) return false;
  session = restored;
  checking = isCheck;
  roundId = state.roundId;
  marks = validMarks(state.progress) ? state.progress : null;
  draft = state.draft ?? '';
  draftEdited = state.draft !== null;
  seen = new Set(state.seen);
  revealed = state.revealed;
  counted = state.counted;
  voiceEnabled = state.voiceEnabled;
  selectedVoiceURI = state.voiceURI;
  return true;
}
function callServerless(endpoint, input) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Telegram не ответил вовремя.')), 3500);
    try {
      telegram.Serverless.call(endpoint, input, (error, result) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}
const gameSync = accountMode ? createAccountSync({
  call: async input => {
    const action = input.action === 'read' ? 'progress' : input.action;
    const result = await callServerless('accountPlay', { ...input, action });
    if (!result || (['read', 'save'].includes(input.action) && !Number.isSafeInteger(result.revision)) ||
        (input.action !== 'save' && !validTotals(result.totals))) {
      throw new Error('Некорректный ответ сервера.');
    }
    return result;
  },
  cache: gameCache,
  seed: !gameCache?.state && legacySession ? snapshot() : null,
  persist: cache => { gameSavedLocally = storeActive(gameKey, cache) && Boolean(cache.state); },
  loadRounds, persistRound, removeRound,
  onRemote: (state, conflict) => {
    if (!restore(state)) return;
    if (conflict) syncNotice = 'Открыта более новая игра с другого устройства.';
    spokenTask = undefined;
    updateVoices();
    if (ui.shell.getAttribute('aria-hidden') === 'false') render(true);
  },
  onTotals: (updated, results) => {
    totals = updated;
    latest = results ?? latest;
    if (!homeOpen) renderTableProgress();
  }
}) : null;
restore(gameCache?.state);

async function syncGame(refresh = false) {
  if (!gameSync) return true;
  try {
    await gameSync.sync(refresh);
    ui.gameSync.textContent = syncNotice;
    return true;
  } catch {
    ui.gameSync.textContent = gameSavedLocally
      ? 'Игра сохранена на устройстве. Синхронизация пока недоступна.'
      : 'Синхронизация игры пока недоступна.';
    return false;
  }
}
function save(finishing = false) {
  const activity = checking ? 'check' : session.mode;
  const previous = marks;
  const scores = finishing && !counted ? latestScores(activity, session) : null;
  const next = !counted ? exerciseProgress(activity, session, seen, previous) : previous;
  const changed = next?.played.some(Boolean) && (scores || !previous ||
    next.played.some((value, i) => value !== previous.played[i] || next.solved[i] !== previous.solved[i]));
  marks = next;
  if (finishing) counted = true;
  const state = snapshot();
  if (gameSync) {
    syncNotice = '';
    gameSync.stage(state, changed ? { ...next, scores, completedAt: scores ? Date.now() : null } : null);
    void syncGame();
  } else {
    if (changed) {
      const offset = next.mode;
      totals[offset] += countMarks(next.solved) - countMarks(previous?.solved ?? []);
      totals[offset + 1] += countMarks(next.played) - countMarks(previous?.played ?? []);
      if (scores) scores.forEach((score, i) => { if (score !== null) latest[activity][i] = score; });
    }
    storeActive(gameKey, { state, totals, latest });
  }
}
function renderTableProgress() {
  const results = latest[ui.masteryMode.value];
  ui.masteryContent.classList.toggle('hidden', totals === null);
  ui.masteryContent.setAttribute('aria-busy', String(progressLoading && totals === null));
  const [studySeen, studyTotal, quizCorrect, quizTotal, checkCorrect, checkTotal] = totals ?? emptyTotals();
  const ratios = [[studySeen, studyTotal], [quizCorrect, quizTotal], [checkCorrect, checkTotal],
    [quizCorrect + checkCorrect, quizTotal + checkTotal]];
  ui.totals.forEach((element, i) => { element.textContent = totals ? ratios[i].join(' / ') : '—'; });
  const rows = results.map((score, i) => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = `×${i + 1}`;
    value.textContent = score === null ? '—' : `${score}/${MAX_FACTOR}`;
    row.append(label, value);
    return row;
  });
  ui.masteryScores.replaceChildren(...rows);
}
async function refreshProgress() {
  if (progressLoading) return;
  progressLoading = true;
  ui.masteryStatus.textContent = totals === null ? 'Загружаем прогресс…' : '';
  renderTableProgress();
  const gameOK = await syncGame(true);
  progressLoading = false;
  ui.masteryStatus.textContent = gameOK ? '' : 'Не удалось обновить данные. Открой раздел ещё раз.';
  renderTableProgress();
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
function showAnswer() {
  revealed = true;
  ui.answer.disabled = true;
  const answer = String(session.list[session.index].answer);
  ui.answer.textContent = answer;
  ui.answer.classList.add('revealed');
  ui.answer.setAttribute('aria-label', 'Ответ: ' + answer);
  ui.answer.title = 'Ответ: ' + answer;
  ui.fill.style.width = '100%';
  ui.bar.setAttribute('aria-valuenow', '10');
}
function reveal() {
  if (checking || revealed || document.hidden || session.index >= session.list.length) return;
  stopTimer();
  showAnswer();
  seen.add(session.list[session.index].id);
  save();
  speak(ui.answer.textContent);
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
  if (!draftEdited && draft === '' && submitted !== undefined) draft = String(submitted);
  renderDraft(submitted);
}
function render(restoring = false) {
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
  if (session.index >= session.list.length) {
    ui.lesson.classList.add('hidden');
    ui.finish.classList.remove('hidden');
    ui.finishTitle.textContent = checking ? 'Проверка закончена!' : 'Отличная работа!';
    ui.finishText.textContent = checking ? 'Все примеры пройдены.' : 'Все примеры пройдены. Начать ещё раз?';
    ui.finishScore.classList.toggle('hidden', !(checking || session.mode === 'quiz'));
    if (checking || session.mode === 'quiz') ui.finishScore.textContent = scoreText();
    ui.finishBack.classList.toggle('hidden', checking);
    ui.nextTable.classList.toggle('hidden', nextTable(session.table) === null);
    if (!restoring) save(true);
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
    if (!restoring) save();
    return;
  }
  const showRestoredAnswer = restoring && revealed;
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
  else if (showRestoredAnswer) showAnswer();
  else runTimer();
  if (!restoring) save();
}
function showReset(open) {
  ui.resetConfirmation.classList.toggle('hidden', !open);
  ui.reset.setAttribute('aria-expanded', String(open));
}
function selectActivity(value) {
  checking = value === 'check';
  start(session.table, session.random, value);
}
function start(table, random, activity = session.mode) {
  session = checking ? newCheck(table, random) : newSession(table, random);
  if (!checking) session.mode = activity;
  draft = '';
  draftEdited = false;
  seen = new Set();
  marks = null;
  counted = false;
  roundId = newPlayId();
  spokenTask = '';
  render();
}
function forward() {
  if (checking) {
    if (!advanceCheck(session)) return;
    draft = '';
    draftEdited = false;
    render();
    (session.index === session.list.length ? ui.finishTitle : ui.checkAnswer).focus();
    return;
  }
  if (session.index >= session.list.length || (session.mode === 'quiz' && !session.quizResults[session.index].solved)) return;
  session.index++;
  render();
}
function backward() {
  if (checking || session.index <= 0 || (session.mode === 'quiz' && session.index < session.list.length && !session.quizResults[session.index].solved)) return;
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
  window.scrollTo(0, 0);
  if (showHome) {
    runTimer();
  } else {
    pauseTimer();
    if (accountMode) void refreshProgress();
    else renderTableProgress();
    ui.masteryTitle.focus();
  }
}
ui.navHome.addEventListener('click', () => selectView(true));
ui.navMastery.addEventListener('click', () => {
  if (!homeOpen && accountMode && !progressLoading) void refreshProgress();
  else selectView(false);
});
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
ui.masteryMode.addEventListener('change', renderTableProgress);
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
  save();
}
function randomPhrase(phrases) {
  return phrases[Math.floor(Math.random() * phrases.length)];
}
function submit() {
  if (!checking || !submitCheckAnswer(session, draft)) return;
  const task = session.list[session.index];
  if (Number(draft) === task.answer) speak(randomPhrase(['Верно!', 'Отлично!', 'Супер!', 'Здорово!', 'Молодец!']));
  else speak(randomPhrase(['Попробуй ещё раз.', 'Упс! Можно исправить.', 'Ничего, попробуй снова.']));
  draftEdited = false;
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
  else {
    if (homeOpen) {
      runTimer();
      if (accountMode) void syncGame(true);
    } else if (accountMode) void refreshProgress();
  }
});
window.addEventListener('online', () => {
  if (accountMode && !homeOpen) void refreshProgress();
  else if (accountMode) void syncGame(true);
});
if (accountMode) {
  let deadline;
  await Promise.race([syncGame(true), new Promise(resolve => { deadline = setTimeout(resolve, 3500); })]);
  clearTimeout(deadline);
}
render(true);
const initialProgress = exerciseProgress(checking ? 'check' : session.mode, session, seen);
if (!marks && !counted && initialProgress.played.some(Boolean)) save();
ui.shell.setAttribute('aria-hidden', 'false');
ui.loading.setAttribute('aria-hidden', 'true');
requestAnimationFrame(() => document.body.classList.add('app-ready'));
