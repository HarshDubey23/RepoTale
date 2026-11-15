// Neural narration: a small pool of Kokoro workers turns each scene's sentence into audio. Several
// workers run at once because one 8-bit model on WebAssembly speaks slower than real time.

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

export class VoicePool {
  constructor(size = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 3)))) {
    this.size = size; this.workers = []; this.jobs = new Map(); this.queue = []; this.busy = new Set();
    this.cache = new Map(); this.onstatus = () => {}; this.loaded = 0; this.id = 0;
  }
  start() {
    if (!this.workers.length) this.spawn();
  }
  spawn() {
    const w = new Worker(new URL('./voice-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => this.reply(w, data);
    w.onerror = e => this.onstatus({ error: e.message || 'The voice could not start in this browser.' });
    w.postMessage({ type: 'load' });
    this.workers.push(w);
  }
  reply(w, data) {
    if (data.type === 'loading') return this.onstatus({ loading: data.progress });
    if (data.type === 'ready') {
      this.loaded++; this.onstatus({ ready: this.loaded });
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
      w.postMessage({ type: 'say', id: job.id, text: job.text, voice: job.voice });
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
  /** Drop work not yet started, e.g. when another repository is opened. */
  clear() { for (const j of this.queue) { j.reject(new Error('cancelled')); } this.queue = []; }
}
