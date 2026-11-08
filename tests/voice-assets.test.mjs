import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import test from 'node:test';
import { voiceCues } from '../app/assets/voice-cues.js';

test('Встроенный голос покрывает все примеры, ответы и фразы настроек', async () => {
  const phrases = new Set([
    'Верно!', 'Попробуй ещё раз.', 'Звук включён.', 'Звук выключен.', 'Привет, я Умножайка.'
  ]);
  for (let a = 1; a <= 10; a++) {
    phrases.add(`${a} умножить на`);
    for (let b = 1; b <= 10; b++) phrases.add(String(a * b));
  }
  assert.deepEqual(new Set(Object.keys(voiceCues)), phrases);
  const clips = Object.values(voiceCues).sort(([a], [b]) => a - b);
  let previousEnd = 0;
  for (const [offset, duration] of clips) {
    assert.ok(Number.isFinite(offset) && offset >= previousEnd);
    assert.ok(Number.isFinite(duration) && duration > 0);
    previousEnd = offset + duration;
  }
  assert.ok((await stat(new URL('../app/assets/voice-ru.mp3', import.meta.url))).size > 0);
});
