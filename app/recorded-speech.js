import { voiceCues } from './assets/voice-cues.js';

let context;
let bufferPromise;
let activeSources = [];
let request = 0;

export function stopRecording() {
  request++;
  for (const source of activeSources) {
    source.stop();
    source.disconnect();
  }
  activeSources = [];
}

function loadBuffer() {
  bufferPromise ??= fetch(new URL('./assets/voice-ru.mp3', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Voice asset unavailable');
      return response.arrayBuffer();
    })
    .then(bytes => context.decodeAudioData(bytes))
    .catch(error => {
      bufferPromise = undefined;
      throw error;
    });
  return bufferPromise;
}

export async function playRecording(phrases) {
  const clips = phrases.map(phrase => voiceCues[phrase]);
  if (clips.some(clip => !clip)) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  const current = request;
  try {
    context ??= new Audio();
    // Resume inside the initiating click/change, before waiting for the asset.
    const resume = context.state === 'running' ? Promise.resolve() : context.resume();
    const [buffer] = await Promise.all([loadBuffer(), resume]);
    if (request !== current || context.state !== 'running') return;
    let when = context.currentTime;
    for (const [start, duration] of clips) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(when, start, duration);
      activeSources.push(source);
      when += duration + 0.06;
    }
  } catch { /* Media may be unavailable in a restricted WebView. */ }
}
