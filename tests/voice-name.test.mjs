import assert from 'node:assert/strict';
import test from 'node:test';
import { spokenVoiceName } from '../app/voice-name.js';

test('В приветствии остаётся имя системного голоса', () => {
  for (const [label, name] of [
    ['Microsoft Irina - Russian (Russia)', 'Irina'],
    ['Microsoft Svetlana Online (Natural) - Russian (Russia)', 'Svetlana'],
    ['Microsoft Pavel Desktop – Russian', 'Pavel'],
    ['Milena (Enhanced)', 'Milena'],
    ['Юрий — русский (Россия)', 'Юрий'],
    ['  Anna Maria (Premium)  ', 'Anna Maria'],
    ['Иван-Павел', 'Иван-Павел']
  ]) {
    assert.equal(spokenVoiceName(label), name, label);
  }
});

test('Технические имена без имени диктора не произносятся', () => {
  for (const label of ['Google русский', 'Russian (Russia)', 'ru-RU-x-rud-local', 'Voice 1', 'Microsoft', '']) {
    assert.equal(spokenVoiceName(label), '', label);
  }
});
