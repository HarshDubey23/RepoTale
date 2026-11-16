// The film's score, composed in code so it fits the film exactly and has no licence to clear: a
// slow four-chord pad, a soft bass pulse, a light tick on the off-beats, and a short whoosh at each
// scene change. Rendered offline once per cut of the film, then played under the voice.

const midi = n => 440 * 2 ** ((n - 69) / 12);
// Am9, Fmaj7, Cmaj7, G6: calm, unresolved enough to sit under speech.
const CHORDS = [[57, 60, 64, 67, 71], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 64]];

/** An AudioBuffer as long as the film; `cuts` are scene lengths in milliseconds. */
export async function score(cuts, { bpm = 80, level = 0.6 } = {}) {
  const sr = 44100, seconds = cuts.reduce((a, b) => a + b, 0) / 1000 + 1.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const master = ctx.createGain(); master.connect(ctx.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(level, 2.5);
  master.gain.setValueAtTime(level, Math.max(2.6, seconds - 3.5));
  master.gain.linearRampToValueAtTime(0, seconds);
  const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 1800; warm.Q.value = 0.4; warm.connect(master);
  const beat = 60 / bpm, bar = beat * 4;

  for (let t = 0, i = 0; t < seconds; t += bar, i++) {
    const chord = CHORDS[i % CHORDS.length];
    // Pad: two slightly detuned saws per note, slow attack and release, so changes blur together.
    for (const n of chord) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.018, t + 1.2); g.gain.setValueAtTime(0.018, t + bar - 0.4); g.gain.linearRampToValueAtTime(0, t + bar + 0.8);
      o.connect(g).connect(warm); o.start(t); o.stop(t + bar + 0.9);
    }
    // Bass: the chord's root, an octave down, on beats one and three.
    for (const b of [0, 2]) {
      const at = t + b * beat, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = midi(chord[0] - 12);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.16, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + beat * 1.6);
      o.connect(g).connect(master); o.start(at); o.stop(at + beat * 1.7);
    }
    // Ticks on the off-beats: filtered noise, barely there, to keep time moving.
    for (let k = 0; k < 4; k++) tick(ctx, master, t + k * beat + beat / 2, 0.012);
  }
  // A whoosh into every scene after the first.
  let at = 0;
  for (const c of cuts.slice(0, -1)) { at += c / 1000; whoosh(ctx, master, at - 0.35); }
  return ctx.startRendering();
}

function noise(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b; return s;
}
function tick(ctx, out, at, gain) {
  const s = noise(ctx, 0.05), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
  s.connect(f).connect(g).connect(out); s.start(at);
}
function whoosh(ctx, out, at) {
  if (at < 0) return;
  const s = noise(ctx, 0.6), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(3500, at + 0.45);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.35, at + 0.3); g.gain.linearRampToValueAtTime(0, at + 0.55);
  s.connect(f).connect(g).connect(out); s.start(at);
}
