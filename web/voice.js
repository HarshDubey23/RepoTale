// Neural narration: a small pool of Kokoro workers turns each scene's sentence into audio. Several
// workers run at once because one 8-bit model on WebAssembly speaks slower than real time.

/** Voices from ElevenLabs, used with the visitor's own API key. */
export const ELEVEN = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George, British' },
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel, American' },
];

/** One sentence from ElevenLabs as encoded audio (MP3). The key goes only to api.elevenlabs.io. */
export async function elevenSay(text, voice, key) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: forEar(text), model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15 } }),
  });
  if (!r.ok) throw new Error(r.status === 401 ? 'ElevenLabs refused the key.' : `ElevenLabs answered ${r.status}.`);
  return r.arrayBuffer();
}

export const VOICES = [
  { id: 'af_heart', label: 'Heart, American' },
  { id: 'am_michael', label: 'Michael, American' },
  { id: 'bf_emma', label: 'Emma, British' },
  { id: 'bm_george', label: 'George, British' },
];

/** Words a voice should hear instead of what is written: paths and symbols read badly aloud. */
export function forEar(text) {
  return text
    .replace(/\b([\w-]+)\/([\w./-]+)/g, (m, a, b) => `${a} ${b.split('/').pop()}`) // src/flask -> src flask
    .replace(/\.(tsx?|jsx?|py|go|vue|svelte|mjs|cjs)\b/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/→/g, ', then ')
    .replace(/\s+/g, ' ').trim();
}

// Each CPU worker holds its own copy of the model and a core at full load; more than two makes a
// laptop stutter for a little extra speed.
const cpuWorkers = () => Math.max(1, Math.min(2, Math.floor((navigator.hardwareConcurrency || 4) / 4)));

export class VoicePool {
  constructor({ studio = false } = {}) {
    // A graphics card runs one full-precision model fast; on the CPU several 8-bit models share the work.
    this.gpu = studio && !!globalThis.navigator?.gpu;
    this.size = this.gpu ? 1 : cpuWorkers(); this.workers = []; this.jobs = new Map(); this.queue = []; this.busy = new Set();
    this.cache = new Map(); this.onstatus = () => {}; this.loaded = 0; this.id = 0;
  }
  start() {
    if (!this.workers.length) this.spawn();
  }
  spawn() {
    const w = new Worker(new URL('./voice-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => this.reply(w, data);
    w.onerror = e => this.onstatus({ error: e.message || 'The voice could not start in this browser.' });
    w.postMessage({ type: 'load', gpu: this.gpu });
    this.workers.push(w);
  }
  reply(w, data) {
    if (data.type === 'loading') return this.onstatus({ loading: data.progress });
    if (data.type === 'ready') {
      this.loaded++; this.mode = data.mode; this.onstatus({ ready: this.loaded, mode: data.mode });
      // The full-precision model did not start on this card: share the work across CPU workers instead.
      if (data.mode === 'standard' && this.gpu) { this.gpu = false; this.size = cpuWorkers(); }
      // The others start only once the first has the model in the browser cache, so it downloads once.
      if (this.loaded === 1) while (this.workers.length < this.size) this.spawn();
      return this.pump();
    }
    const job = this.jobs.get(data.id);
    this.busy.delete(w); this.jobs.delete(data.id);
    if (job) data.type === 'audio' ? job.resolve({ audio: data.audio, rate: data.rate }) : job.reject(new Error(data.message));
    this.pump();
  }
  pump() {
    for (const w of this.workers) {
      if (this.busy.has(w) || !this.queue.length) continue;
      const job = this.queue.shift();
      this.busy.add(w); this.jobs.set(job.id, job);
      w.postMessage({ type: 'say', id: job.id, text: job.text, voice: job.voice, gpu: this.gpu });
    }
  }
  /** Audio for one sentence, cached by voice and text. */
  say(text, voice) {
    const key = voice + '\u0000' + text;
    if (!this.cache.has(key)) {
      this.start();
      this.cache.set(key, new Promise((resolve, reject) => { this.queue.push({ id: ++this.id, text: forEar(text), voice, resolve, reject }); this.pump(); }));
      this.cache.get(key).catch(() => this.cache.delete(key));
    }
    return this.cache.get(key);
  }
  /** Load the model and speak one word, so the slow first run (on a graphics card, compiling its
   *  shaders takes tens of seconds) is over before the film needs its first scene. */
  warm(voice) { return this.say('Ready.', voice).catch(() => {}); }
  /** Drop work not yet started, e.g. when another repository is opened. */
  clear() { for (const j of this.queue) { j.reject(new Error('cancelled')); } this.queue = []; }
}
