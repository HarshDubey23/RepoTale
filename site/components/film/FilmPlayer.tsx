'use client';
// The film player. One timeline of beats (a sentence each); the picture is drawn from where the clock is, and the
// voice speaks each beat on its own, so words and picture start together. The viewer sets the pace: pause, step a
// sentence back or forward, jump to any sentence from the transcript, turn captions on (off by default while a
// voice speaks: on-screen text that repeats the narration costs learning), and choose the voice. Music is off
// unless asked for, and sits far under the voice when it plays.
import { Captions, Download, LoaderCircle, Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { readTime, type Film } from '@/lib/film';
import { drawFrame, look, W, H, type Look } from '@/lib/filmdraw';
import { score } from '@/lib/score';
import { VOICES, VoicePool } from '@/lib/voice';

type Mode = 'kokoro' | 'browser' | 'off';
interface Slot { s: number; b: number; lead: number; speak: number; start: number; end: number; audio?: AudioBuffer; silent?: boolean }
interface Engine {
  film: Film; slots: Slot[]; t: number; last: number; playing: boolean; waitFrom: number; raf: number; frame: number; look: Look | null;
  ac: AudioContext | null; src: AudioBufferSourceNode | null; mus: AudioBufferSourceNode | null; musBuf: AudioBuffer | null;
  spoken: number; speaking: boolean; pool: VoicePool | null; mode: Mode; voice: string; ready: boolean;
  captions: boolean; music: boolean; reduce: boolean; status: string;
}

const LEAD = 450, TAIL = 280, PATIENCE = 3500;
const QUERY = '(prefers-reduced-motion: reduce)';
const onMotion = (f: () => void) => { const q = matchMedia(QUERY); q.addEventListener('change', f); return () => q.removeEventListener('change', f); };
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Every beat's place on the clock. A voiced beat lasts as long as its audio; a sentence that already played on
 *  captions keeps the length it had; the first beat of a scene gets a lead, so the picture settles before words. */
function timeline(film: Film, keep?: Slot[]): Slot[] {
  let at = 0;
  return film.scenes.flatMap((s, si) => s.beats.map((beat, bi) => {
    const old = keep?.find(x => x.s === si && x.b === bi);
    const speak = old?.audio && !old.silent ? old.audio.duration * 1000 : old?.speak ?? readTime(beat.say);
    const slot: Slot = { s: si, b: bi, lead: bi === 0 ? LEAD : 0, speak, start: at, end: 0, audio: old?.audio, silent: old?.silent };
    slot.end = at + slot.lead + speak + TAIL; at = slot.end;
    return slot;
  }));
}
const slotAt = (e: Engine, t = e.t) => { const i = e.slots.findIndex(x => t < x.end); return i === -1 ? e.slots.length - 1 : i; };
const total = (e: Engine) => e.slots.at(-1)!.end;
function hush(e: Engine) {
  try { e.src?.stop(); } catch { /* already stopped */ }
  e.src = null; e.spoken = -1; e.speaking = false;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
function quiet(e: Engine) { try { e.mus?.stop(); } catch { /* already stopped */ } e.mus = null; }

function paint(e: Engine, canvas: HTMLCanvasElement | null) {
  const c = canvas?.getContext('2d');
  if (!c) return;
  e.look ??= look();
  const slot = e.slots[slotAt(e)]!, scene = e.film.scenes[slot.s]!;
  // Paused, a sentence shows settled (its picture built, its example typed), so the frame reads as a poster.
  const t = e.playing ? e.t : Math.max(e.t, Math.min(slot.end - 1, slot.start + slot.lead + 2200));
  drawFrame(c, {
    scene, b: slot.b, sceneMs: t - e.slots.find(x => x.s === slot.s)!.start, speechMs: t - slot.start - slot.lead, reduce: e.reduce,
    captions: e.captions || e.mode === 'off' || !!slot.silent, status: e.status,
  }, e.look);
}

/** Starts the current beat's voice at the point of its sentence the clock is at. */
function speak(e: Engine) {
  const i = slotAt(e), slot = e.slots[i]!, into = e.t - slot.start - slot.lead;
  if (e.spoken === i || into < 0 || into >= slot.speak) return;
  e.spoken = i;
  if (e.mode === 'kokoro' && slot.audio && !slot.silent && e.ac) {
    const src = e.ac.createBufferSource(); src.buffer = slot.audio; src.connect(e.ac.destination);
    src.start(0, into / 1000); e.src = src;
  } else if (e.mode === 'browser' && 'speechSynthesis' in window && into < 300) {
    const u = new SpeechSynthesisUtterance(e.film.scenes[slot.s]!.beats[slot.b]!.say);
    const en = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    u.voice = en.find(v => /natural|neural|online|google|samantha|daniel|aria|jenny/i.test(v.name)) ?? en[0] ?? null;
    u.rate = 1.05; e.speaking = true;
    u.onend = u.onerror = () => { e.speaking = false; };
    speechSynthesis.speak(u);
  }
}

/** Runs the clock: one frame per animation frame until the film pauses or ends. `onSync` tells React where it is. */
function run(e: Engine, canvas: () => HTMLCanvasElement | null, onSync: () => void, onEnd: () => void) {
  const step = (ms: number) => {
    if (!e.playing) return;
    const dt = Math.min(100, ms - (e.last || ms)); e.last = ms;
    const slot = e.slots[slotAt(e)]!, into = e.t - slot.start - slot.lead, was = e.status;
    let hold = false;
    // The neural voice is still making this sentence: wait for it, but briefly. Past that the sentence plays on
    // captions and the voice joins at the next one that is ready, so the screen never sits empty.
    if (e.mode === 'kokoro' && into >= 0 && !slot.audio && !slot.silent) {
      e.waitFrom ||= ms;
      if (ms - e.waitFrom < PATIENCE) { hold = true; e.status = e.ready ? 'Voicing this sentence' : e.status || 'Loading the voice'; }
      else { slot.silent = true; e.waitFrom = 0; e.status = e.ready ? '' : 'The voice is still loading: captions until it is ready'; }
    } else e.waitFrom = 0;
    // The browser's own voice sets its pace: a beat ends when its sentence does.
    if (e.mode === 'browser' && e.speaking && into >= slot.speak) hold = true;
    if (!hold) e.t += dt;
    speak(e);
    if (e.t >= total(e)) { e.t = total(e) - 1; e.playing = false; hush(e); quiet(e); onEnd(); }
    paint(e, canvas());
    if (++e.frame % 8 === 0 || !e.playing || was !== e.status) onSync();
    if (e.playing) e.raf = requestAnimationFrame(step);
  };
  e.raf = requestAnimationFrame(step);
}

export function FilmPlayer({ film, name, blob }: { film: Film; name: string; blob: string }) {
  const id = useId();
  const reduce = useSyncExternalStore(onMotion, () => matchMedia(QUERY).matches, () => false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('kokoro');
  const [voice, setVoice] = useState<string>(VOICES[0].id);
  const [captions, setCaptions] = useState(false);
  const [music, setMusic] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(() => { const s = timeline(film); return { t: 0, slot: 0, total: s.at(-1)!.end }; });
  const [status, setStatus] = useState('');
  const [recording, setRecording] = useState<number | null>(null);
  const E = useRef<Engine>({
    film, slots: timeline(film), t: 0, last: 0, playing: false, waitFrom: 0, raf: 0, frame: 0, look: null, ac: null, src: null, mus: null, musBuf: null,
    spoken: -1, speaking: false, pool: null, mode: 'kokoro', voice: VOICES[0].id, ready: false, captions: false, music: false, reduce: false, status: '',
  });
  // The beats in order, for the transcript and the controls; the engine's slots carry the same order.
  const flat = useMemo(() => film.scenes.flatMap((s, si) => s.beats.map((b, bi) => ({ si, bi, b }))), [film]);

  const sync = useCallback(() => {
    const e = E.current;
    setNow({ t: e.t, slot: slotAt(e), total: total(e) });
    setStatus(e.status);
  }, []);
  const draw = useCallback(() => paint(E.current, canvas.current), []);

  const startMusic = useCallback(async () => {
    const e = E.current;
    quiet(e);
    if (!e.music || !e.playing || !e.ac) return;
    if (!e.musBuf || e.musBuf.duration * 1000 < total(e)) e.musBuf = await score(total(e) + 4000);
    if (!e.music || !e.playing || !e.ac) return;
    const m = e.ac.createBufferSource(); m.buffer = e.musBuf; m.connect(e.ac.destination);
    m.start(0, Math.min(e.t / 1000, e.musBuf.duration - 0.1)); e.mus = m;
  }, []);

  /** Voices every sentence in order; each lands in the timeline as it arrives, ahead of the clock. */
  const voiceAll = useCallback(() => {
    const e = E.current;
    if (e.mode !== 'kokoro') return;
    e.pool ??= new VoicePool();
    e.pool.onstatus = s => {
      if (s.error) { e.status = 'The voice could not start in this browser: captions instead'; e.mode = 'off'; setMode('off'); }
      else if (s.loading !== undefined && !e.ready) e.status = `Loading the voice, once: ${Math.round(s.loading * 100)}%`;
      else if (s.ready) { e.ready = true; e.status = ''; }
      sync(); paint(e, canvas.current);
    };
    const v = e.voice;
    e.film.scenes.forEach((s, si) => s.beats.forEach((beat, bi) => {
      e.pool!.say(beat.say, v).then(({ audio, rate }) => {
        if (e.voice !== v || e.mode !== 'kokoro' || !e.ac) return;
        const buf = e.ac.createBuffer(1, audio.length, rate); buf.copyToChannel(new Float32Array(audio), 0);
        const cur = e.slots[slotAt(e)]!, local = e.t - cur.start;
        const slot = e.slots.find(x => x.s === si && x.b === bi)!;
        slot.audio = buf;
        if (slot !== cur) slot.silent = false;
        e.slots = timeline(e.film, e.slots);
        e.t = e.slots.find(x => x.s === cur.s && x.b === cur.b)!.start + local;
        sync();
      }).catch(() => { /* cancelled, or this sentence failed: it plays on captions */ });
    }));
  }, [sync]);

  const play = useCallback(() => {
    const e = E.current;
    if (e.playing) return;
    e.ac ??= new AudioContext();
    void e.ac.resume();
    if (e.t >= total(e) - 1) e.t = 0;
    e.playing = true; e.last = 0; setPlaying(true);
    voiceAll(); void startMusic();
    run(e, () => canvas.current, sync, () => setPlaying(false));
  }, [voiceAll, startMusic, sync]);
  const pause = useCallback(() => {
    const e = E.current;
    e.playing = false; cancelAnimationFrame(e.raf); hush(e); quiet(e); setPlaying(false);
    e.status = ''; paint(e, canvas.current); sync();
  }, [sync]);
  const seek = useCallback((t: number) => {
    const e = E.current;
    hush(e); e.t = Math.max(0, Math.min(t, total(e) - 1)); e.waitFrom = 0;
    if (e.playing) { speak(e); void startMusic(); }
    paint(e, canvas.current); sync();
  }, [startMusic, sync]);
  const toSlot = useCallback((i: number) => {
    const S = E.current.slots, k = Math.max(0, Math.min(S.length - 1, i));
    seek(S[k]!.start + 1);
  }, [seek]);

  useEffect(() => { E.current.captions = captions; draw(); }, [captions, draw]);
  useEffect(() => { E.current.reduce = reduce; draw(); }, [reduce, draw]);
  useEffect(() => { const e = E.current; e.music = music; if (music) void startMusic(); else quiet(e); }, [music, startMusic]);
  // A new voice drops the sentences voiced so far; the film keeps its place.
  useEffect(() => {
    const e = E.current;
    if (e.mode === mode && e.voice === voice) return;
    hush(e); e.pool?.clear();
    e.mode = mode; e.voice = voice; e.ready = mode !== 'kokoro' ? e.ready : false; e.status = '';
    const at = e.slots[slotAt(e)]!, local = e.t - at.start;
    e.slots = timeline(e.film);
    e.t = Math.min(e.slots.find(x => x.s === at.s && x.b === at.b)!.start + local, total(e) - 1);
    if (e.playing) voiceAll();
    draw(); sync();
  }, [mode, voice, voiceAll, draw, sync]);

  // The canvas follows the page's theme and fonts, and is drawn again when either changes.
  useEffect(() => {
    const e = E.current, fresh = () => { e.look = look(); paint(e, canvas.current); };
    const lk = look();
    void Promise.all([`64px ${lk.serif}`, `20px ${lk.sans}`, `16px ${lk.mono}`].map(f => document.fonts.load(f))).then(fresh, fresh);
    const mo = new MutationObserver(fresh);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    fresh();
    return () => { mo.disconnect(); cancelAnimationFrame(e.raf); e.playing = false; hush(e); quiet(e); e.pool?.stop(); void e.ac?.close(); e.ac = null; };
  }, []);

  const key = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement;
    if (target.closest('select, input, a')) return;
    const k = ev.key.toLowerCase();
    if (k === 'k' || (k === ' ' && !target.closest('button'))) { ev.preventDefault(); if (E.current.playing) pause(); else play(); }
    else if (k === 'arrowright') { ev.preventDefault(); toSlot(now.slot + 1); }
    else if (k === 'arrowleft') { ev.preventDefault(); toSlot(now.slot - 1); }
    else if (k === 'c') setCaptions(x => !x);
  };

  /** Records the film to a video file in real time, with the voice (and any music) mixed in. */
  const record = async () => {
    const e = E.current;
    if (recording !== null) return;
    pause();
    e.ac ??= new AudioContext(); await e.ac.resume();
    if (e.mode === 'kokoro') {
      voiceAll(); e.status = 'Voicing every sentence first'; sync(); paint(e, canvas.current);
      const until = performance.now() + 180_000;
      while (e.slots.some(s => !s.audio) && performance.now() < until && e.mode === 'kokoro') await new Promise(r => setTimeout(r, 300));
    }
    const type = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!type) { e.status = 'This browser cannot record video. Try Chrome or Edge.'; sync(); return; }
    const voiced = e.mode === 'kokoro' && e.slots.every(s => s.audio);
    const S = timeline(e.film, e.slots.map(s => ({ ...s, silent: false }))), length = S.at(-1)!.end;
    const cv = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 }), c = cv.getContext('2d')!;
    const stream = cv.captureStream(30), dest = e.ac.createMediaStreamDestination();
    for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 }), chunks: Blob[] = [];
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    const at0 = e.ac.currentTime + 0.25, nodes: AudioBufferSourceNode[] = [];
    if (voiced) for (const s of S) { const n = e.ac.createBufferSource(); n.buffer = s.audio!; n.connect(dest); n.start(at0 + (s.start + s.lead) / 1000); nodes.push(n); }
    if (e.music) { const n = e.ac.createBufferSource(); n.buffer = e.musBuf ?? await score(length + 4000); n.connect(dest); n.start(at0); nodes.push(n); }
    rec.start(500); setRecording(0);
    const start = performance.now() + 250;
    await new Promise<void>(resolve => {
      const tick = () => {
        const t = Math.max(0, performance.now() - start), i = S.findIndex(x => t < x.end), slot = S[i === -1 ? S.length - 1 : i]!;
        drawFrame(c, { scene: e.film.scenes[slot.s]!, b: slot.b, sceneMs: t - S.find(x => x.s === slot.s)!.start, speechMs: t - slot.start - slot.lead,
          reduce: false, captions: e.captions || !voiced }, e.look ?? look());
        setRecording(Math.min(1, t / length));
        if (t >= length + 300) return resolve();
        setTimeout(tick, 1000 / 30); // timers keep running in a hidden tab; animation frames do not
      };
      tick();
    });
    for (const n of nodes) try { n.stop(); } catch { /* already done */ }
    rec.stop(); await stopped;
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob(chunks, { type: type.split(';')[0] })), download: `${name}-repotale.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`,
    });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    e.status = ''; setRecording(null); sync(); paint(e, canvas.current);
  };

  const cur = flat[now.slot];
  const btn = 'grid size-10 shrink-0 place-items-center rounded-m text-text-2 transition-colors duration-150 ease-rt hover:bg-surface-2 hover:text-text';
  const cite = (b: (typeof flat)[number]['b']) => b.cite && `${b.cite.file}${b.cite.line ? `:${b.cite.line}${b.cite.end ? `-${b.cite.end}` : ''}` : ''}`;

  return (
    <div onKeyDown={key}>
      <div className="relative overflow-hidden rounded-l border border-border bg-bg shadow-rt">
        {!playing && now.t === 0 && (
          <button type="button" onClick={play} aria-label={`Play the film of ${name}`}
            className="absolute right-[6%] top-[38%] z-10 grid size-16 place-items-center rounded-full bg-accent text-on-accent shadow-rt transition-transform duration-150 ease-rt hover:scale-105 md:size-20">
            <Play aria-hidden size={28} className="translate-x-0.5" />
          </button>
        )}
        <canvas ref={canvas} width={W * 1.5} height={H * 1.5} tabIndex={0} onClick={() => (playing ? pause() : play())}
          role="img" aria-label={`The film of ${name}.${cur ? ` Now: ${cur.b.say}` : ''} Space plays or pauses; the transcript below has every sentence.`}
          className="block aspect-video h-auto w-full cursor-pointer" />
        <div className="border-t border-border px-2 pb-1 pt-2 md:px-3">
          <label htmlFor={`${id}-seek`} className="sr-only">Position in the film</label>
          <input id={`${id}-seek`} type="range" min={0} max={Math.max(1, Math.round(now.total))} step={100} value={Math.round(now.t)}
            onChange={ev => seek(Number(ev.target.value))} aria-valuetext={`${clock(now.t)} of ${clock(now.total)}${cur ? `, ${film.scenes[cur.si]?.title}` : ''}`}
            className="block w-full accent-accent" />
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => toSlot(now.slot - 1)} aria-label="Previous sentence" className={btn}><SkipBack aria-hidden size={18} /></button>
            <button type="button" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'}
              className="grid size-10 shrink-0 place-items-center rounded-m bg-accent text-on-accent transition-colors duration-150 ease-rt hover:bg-accent-hover">
              {playing ? <Pause aria-hidden size={18} /> : <Play aria-hidden size={18} />}
            </button>
            <button type="button" onClick={() => toSlot(now.slot + 1)} aria-label="Next sentence" className={btn}><SkipForward aria-hidden size={18} /></button>
            <span className="tabular ml-2 font-mono text-mono-s text-text-2">{clock(now.t)} / {clock(now.total)}</span>
            <span className="ml-auto flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => setCaptions(x => !x)} aria-pressed={captions} aria-label="Captions" title="Captions (C)"
                className={`${btn} ${captions ? 'bg-surface-2 text-text' : ''}`}><Captions aria-hidden size={18} /></button>
              <button type="button" onClick={() => setMusic(x => !x)} aria-pressed={music} aria-label="Music under the voice" title="Music under the voice"
                className={`${btn} ${music ? 'bg-surface-2 text-text' : ''}`}><Music aria-hidden size={18} /></button>
              <label htmlFor={`${id}-voice`} className="sr-only">Voice</label>
              <select id={`${id}-voice`} value={mode === 'kokoro' ? voice : mode} onChange={ev => {
                const v = ev.target.value;
                if (v === 'browser' || v === 'off') setMode(v); else { setMode('kokoro'); setVoice(v); }
              }} className="h-10 max-w-[13rem] rounded-m border border-border bg-surface px-2 text-small text-text">
                <optgroup label="Neural voice, runs in your browser">
                  {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </optgroup>
                <option value="browser">Your browser&rsquo;s voice</option>
                <option value="off">No voice, captions</option>
              </select>
              <button type="button" onClick={() => void record()} disabled={recording !== null} aria-label="Download the film as a video" title="Download as a video"
                className={`${btn} disabled:cursor-progress`}>
                {recording !== null ? <LoaderCircle aria-hidden size={18} className="animate-spin" /> : <Download aria-hidden size={18} />}
              </button>
            </span>
          </div>
          <p className="min-h-[1.45em] px-2 pb-1 text-small text-text-2" aria-live="polite">
            {recording !== null ? `Recording the video: ${Math.round(recording * 100)}%. It plays through once, in real time.` : status}
          </p>
        </div>
      </div>

      <section aria-labelledby={`${id}-tx`} className="mt-16 md:mt-20">
        <h2 id={`${id}-tx`} className="font-display text-h2 text-balance">Every sentence, and its line.</h2>
        <p className="mt-3 max-w-[62ch] text-body text-text-2 text-pretty">
          The film&rsquo;s whole script. Pick a sentence to play from there; each receipt opens the code at the commit the film was made from.
        </p>
        <ol className="mt-8 grid gap-8">
          {film.scenes.map((s, si) => (
            <li key={si}>
              <h3 className="font-mono text-mono-s uppercase tracking-wider text-text-2">{s.title}</h3>
              <ol className="mt-3 grid gap-2">
                {s.beats.map((b, bi) => {
                  const k = flat.findIndex(x => x.si === si && x.bi === bi), on = k === now.slot;
                  return (
                    <li key={bi} className={`rounded-m border px-4 py-3 transition-colors duration-150 ease-rt ${on ? 'border-accent bg-accent-subtle' : 'border-border'}`}>
                      <button type="button" onClick={() => toSlot(k)} aria-current={on ? 'true' : undefined} className="w-full rounded-s text-left text-body text-text">{b.say}</button>
                      {b.cite && (
                        <a href={`${blob}${b.cite.file}${b.cite.line ? `#L${b.cite.line}${b.cite.end ? `-L${b.cite.end}` : ''}` : ''}`}
                          className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all rounded-s border border-border bg-surface-2 px-2 py-0.5 font-mono text-mono-s text-text-2 transition-colors duration-150 ease-rt hover:text-text">
                          <span className="size-1.5 shrink-0 rounded-full bg-verified" aria-hidden />{cite(b)}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
