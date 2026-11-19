// Narration for the film. Kokoro-82M, an open neural voice, runs in the visitor's browser (public/voice-worker.js):
// a sentence in, audio out, nothing sent anywhere. Each beat is voiced on its own, so the film knows exactly when
// every sentence starts and ends and can change the picture with the words. Port of web/voice.js.

export const VOICES = [
  { id: 'af_heart', label: 'Heart, American' },
  { id: 'am_michael', label: 'Michael, American' },
  { id: 'bf_emma', label: 'Emma, British' },
  { id: 'bm_george', label: 'George, British' },
] as const;

/** What a voice should hear instead of what is written: paths and extensions read badly aloud. */
export function forEar(text: string) {
  return text
    .replace(/\b([\w-]+)\/([\w./-]+)/g, (_, a: string, b: string) => `${a} ${b.split('/').pop()}`)
    .replace(/\.(tsx?|jsx?|py|go|vue|svelte|mjs|cjs)\b/g, '')
    .replace(/_+/g, ' ')
    .replace(/→/g, ', then ')
    .replace(/\s+/g, ' ').trim();
}

export type VoiceStatus = { loading?: number; ready?: boolean; mode?: 'studio' | 'standard'; error?: string };
type Job = { id: number; text: string; voice: string; resolve: (a: { audio: Float32Array; rate: number }) => void; reject: (e: Error) => void };

// Each CPU worker holds its own copy of the model and a core at full load; more than two makes a laptop stutter.
const cpuWorkers = () => Math.max(1, Math.min(2, Math.floor((navigator.hardwareConcurrency || 4) / 4)));
/** Kokoro's own pace is near 150 words a minute; this brings it near 170, where viewers stay longest. */
const SPEED = 1.1;

export class VoicePool {
  private gpu = 'gpu' in navigator;
  private size = this.gpu ? 1 : cpuWorkers();
  private workers: Worker[] = [];
  private busy = new Set<Worker>();
  private jobs = new Map<number, Job>();
  private queue: Job[] = [];
  private cache = new Map<string, Promise<{ audio: Float32Array; rate: number }>>();
  private loaded = 0;
  private id = 0;
  onstatus: (s: VoiceStatus) => void = () => {};

  private spawn() {
    const w = new Worker('/voice-worker.js', { type: 'module' });
    w.onmessage = ({ data }) => this.reply(w, data);
    w.onerror = e => this.onstatus({ error: e.message || 'The voice could not start in this browser.' });
    w.postMessage({ type: 'load', gpu: this.gpu });
    this.workers.push(w);
  }

  private reply(w: Worker, data: { type: string; id?: number; progress?: number; mode?: 'studio' | 'standard'; audio?: Float32Array; rate?: number; message?: string }) {
    if (data.type === 'loading') return this.onstatus({ loading: data.progress });
    if (data.type === 'ready') {
      this.loaded++;
      this.onstatus({ ready: true, mode: data.mode });
      // The full-precision model did not start on this card: share the work across CPU workers instead.
      if (data.mode === 'standard' && this.gpu) { this.gpu = false; this.size = cpuWorkers(); }
      // The others start only once the first has the model in the browser cache, so it downloads once.
      if (this.loaded === 1) while (this.workers.length < this.size) this.spawn();
      return this.pump();
    }
    const job = data.id === undefined ? undefined : this.jobs.get(data.id);
    this.busy.delete(w);
    if (data.id !== undefined) this.jobs.delete(data.id);
    if (job) {
      if (data.type === 'audio' && data.audio && data.rate) job.resolve({ audio: data.audio, rate: data.rate });
      else job.reject(new Error(data.message ?? 'The voice failed on this sentence.'));
    }
    this.pump();
  }

  private pump() {
    for (const w of this.workers) {
      if (this.busy.has(w) || !this.queue.length || !this.loaded) continue;
      const job = this.queue.shift()!;
      this.busy.add(w);
      this.jobs.set(job.id, job);
      w.postMessage({ type: 'say', id: job.id, text: job.text, voice: job.voice, gpu: this.gpu, speed: SPEED });
    }
  }

  /** Audio for one sentence, cached by voice and text. Sentences are voiced in the order they are asked for. */
  say(text: string, voice: string) {
    const key = `${voice}\u0000${text}`;
    let p = this.cache.get(key);
    if (!p) {
      if (!this.workers.length) this.spawn();
      p = new Promise((resolve, reject) => { this.queue.push({ id: ++this.id, text: forEar(text), voice, resolve, reject }); this.pump(); });
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
    }
    return p;
  }

  /** Drop sentences not yet started, when the voice changes or the film is left. */
  clear() { for (const j of this.queue) j.reject(new Error('cancelled')); this.queue = []; }
  stop() { this.clear(); for (const w of this.workers) w.terminate(); this.workers = []; this.loaded = 0; this.busy.clear(); }
}
