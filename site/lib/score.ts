// The film's optional score, composed in code so it has no licence to clear: a slow four-chord pad and a soft
// bass on beats one and three, rendered once to the film's length. Off unless the viewer asks for it, and mixed
// far under the voice (a bed about 20 dB below speech is the usual guide), with no whooshes or ticks on cuts:
// sounds the narration does not use only compete with it. Port of web/music.js, quieter and plainer.

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
// Am9, Fmaj7, Cmaj7, G6: calm, unresolved enough to sit under speech.
const CHORDS = [[57, 60, 64, 67, 71], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 64]];

export async function score(ms: number, { bpm = 72, level = 0.18 } = {}) {
  const sr = 44100, seconds = ms / 1000;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const master = ctx.createGain(); master.connect(ctx.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(level, 3);
  master.gain.setValueAtTime(level, Math.max(3.1, seconds - 4));
  master.gain.linearRampToValueAtTime(0, seconds);
  const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 1400; warm.Q.value = 0.4; warm.connect(master);
  const beat = 60 / bpm, bar = beat * 4;
  for (let t = 0, i = 0; t < seconds; t += bar, i++) {
    const chord = CHORDS[i % CHORDS.length]!;
    for (const n of chord) for (const det of [-6, 6]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.016, t + 1.4); g.gain.setValueAtTime(0.016, t + bar - 0.4); g.gain.linearRampToValueAtTime(0, t + bar + 0.9);
      o.connect(g).connect(warm); o.start(t); o.stop(t + bar + 1);
    }
    for (const b of [0, 2]) {
      const at = t + b * beat, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = midi(chord[0]! - 12);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.12, at + 0.03); g.gain.exponentialRampToValueAtTime(0.001, at + beat * 1.6);
      o.connect(g).connect(master); o.start(at); o.stop(at + beat * 1.7);
    }
  }
  return ctx.startRendering();
}
