// Draws one frame of the film on a canvas. The same function paints the player and the recorded video.
// Design rules, from the research the film follows: what the sentence names is lit and the rest steps back
// (signaling); the picture changes when the sentence starts, not on a timer (temporal contiguity); nothing moves
// or decorates that the words do not use (coherence). Colors and fonts are the page's own tokens, read at run time.
import type { Beat, Scene } from './film';
import { layout } from './layout';

export const W = 1280, H = 720;
const M = 72;

export interface Look {
  bg: string; surface: string; surface2: string; border: string; borderStrong: string; text: string; text2: string; text3: string;
  accent: string; accentText: string; verified: string; verifiedText: string; verifiedSubtle: string; unverifiedText: string; inventedText: string;
  serif: string; sans: string; mono: string;
}

/** The page's tokens, as the canvas needs them. Read again when the theme changes. */
export function look(): Look {
  const cs = getComputedStyle(document.documentElement), v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--rt-bg'), surface: v('--rt-surface'), surface2: v('--rt-surface-2'), border: v('--rt-border'), borderStrong: v('--rt-border-strong'),
    text: v('--rt-text'), text2: v('--rt-text-2'), text3: v('--rt-text-3'), accent: v('--rt-accent'), accentText: v('--rt-accent-text'),
    verified: v('--rt-verified'), verifiedText: v('--rt-verified-text'), verifiedSubtle: v('--rt-verified-subtle'),
    unverifiedText: v('--rt-unverified-text'), inventedText: v('--rt-invented-text'),
    serif: v('--font-instrument-serif') || 'Georgia, serif', sans: v('--font-instrument-sans') || 'system-ui, sans-serif', mono: v('--font-jetbrains-mono') || 'ui-monospace, monospace',
  };
}

export interface Moment {
  scene: Scene; b: number;
  /** Milliseconds since the scene began, and since the current beat's sentence began (negative before it). */
  sceneMs: number; speechMs: number;
  captions: boolean; reduce: boolean;
  /** A short line shown above the picture while the voice is getting ready. */
  status?: string;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;
const plural = (n: number, w: string) => `${n.toLocaleString('en')} ${w}${n === 1 ? '' : 's'}`;
const base = (f: string) => f.split('/').pop() ?? f;

type C = CanvasRenderingContext2D;
function font(c: C, size: number, family: string, weight = 400, style = '') { c.font = `${style} ${weight} ${size}px ${family}`.trim(); }
function wrap(c: C, text: string, max: number) {
  const out: string[] = []; let line = '';
  for (const w of text.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (c.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}
function fitSize(c: C, text: string, max: number, size: number, family: string, min = 28) {
  let s = size;
  for (; s > min; s -= 4) { font(c, s, family); if (c.measureText(text).width <= max) break; }
  return s;
}
function rr(c: C, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function clip(c: C, text: string, max: number) {
  if (c.measureText(text).width <= max) return text;
  let s = text; while (s.length > 1 && c.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Milliseconds since the sentence that first names `id` began: Infinity once that sentence is past, -Infinity
 *  before it, so anything that grows or counts does it once, while it is being talked about. */
function age(m: Moment, id: string) {
  const first = m.scene.beats.findIndex(x => x.focus.includes(id));
  return first === -1 || first < m.b ? Infinity : first > m.b ? -Infinity : m.speechMs;
}
/** How far an element has appeared: it rises in as the sentence that names it starts. */
function shown(m: Moment, id: string, delay = 0) {
  const a = age(m, id);
  return m.reduce ? (a > -Infinity ? 1 : 0) : ease((a + 200 - delay) / 420);
}
/** How lit an element is: what the sentence names stays full, the rest steps back while it is said. */
function lit(m: Moment, id: string) {
  const focus = m.scene.beats[m.b]!.focus;
  if (!focus.length || focus.includes(id)) return 1;
  return 1 - 0.6 * (m.reduce ? 1 : ease((m.speechMs + 250) / 300));
}

export function drawFrame(c: C, m: Moment, L: Look) {
  c.setTransform(c.canvas.width / W, 0, 0, c.canvas.height / H, 0, 0);
  c.fillStyle = L.bg; c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.globalAlpha = 1;
  // Scenes settle in over the lead before the first sentence: a short rise, never a flourish.
  const enter = m.reduce ? 1 : ease(m.sceneMs / 450);
  c.save();
  c.globalAlpha = enter; c.translate(0, (1 - enter) * 14);
  DRAW[m.scene.kind](c, m as never, L);
  c.restore(); c.globalAlpha = 1;
  chrome(c, m, L);
}

function chrome(c: C, m: Moment, L: Look) {
  font(c, 15, L.mono, 500);
  c.fillStyle = L.text2; c.fillText(m.scene.title.toUpperCase(), M, 52);
  const beat = m.scene.beats[m.b];
  if (beat?.cite) receipt(c, beat, L, m.captions ? H - 128 : H - 52);
  if (m.captions && beat) captions(c, beat.say, L);
  if (m.status) {
    font(c, 15, L.sans, 500);
    const w = c.measureText(m.status).width + 40;
    c.fillStyle = L.surface2; rr(c, W - M - w, 30, w, 32, 16); c.fill();
    c.fillStyle = L.text2; c.fillText(m.status, W - M - w + 20, 51);
  }
}

/** The receipt for the sentence being said: always in the same place, so the eye learns where to look. */
function receipt(c: C, beat: Beat, L: Look, y: number) {
  const cite = beat.cite!;
  const label = `${cite.file}${cite.line ? `:${cite.line}${cite.end && cite.end > cite.line ? `-${cite.end}` : ''}` : ''}`;
  font(c, 16, L.mono, 500);
  const text = clip(c, label, W - 2 * M - 60), w = c.measureText(text).width;
  c.fillStyle = L.surface; rr(c, M, y - 24, w + 44, 34, 8); c.fill();
  c.strokeStyle = L.border; c.lineWidth = 1; c.stroke();
  c.fillStyle = L.verified; c.beginPath(); c.arc(M + 18, y - 7, 4, 0, 7); c.fill();
  c.fillStyle = L.text; c.fillText(text, M + 32, y - 2);
}

/** Captions, when asked for: the sentence being said, set plainly at the foot of the frame. */
function captions(c: C, say: string, L: Look) {
  font(c, 26, L.sans, 500);
  const lines = wrap(c, say, W - 2 * M - 48).slice(0, 2);
  const h = lines.length * 34 + 24, y = H - 24 - h;
  c.fillStyle = L.surface; rr(c, M - 4, y, W - 2 * M + 8, h, 12); c.fill();
  c.fillStyle = L.text;
  lines.forEach((l, i) => c.fillText(l, M + 20, y + 40 + i * 34));
}

const DRAW: { [K in Scene['kind']]: (c: C, m: Moment & { scene: Extract<Scene, { kind: K }> }, L: Look) => void } = {
  title(c, m, L) {
    const s = m.scene;
    const size = fitSize(c, s.name, W - 2 * M, 168, L.serif, 64);
    font(c, size, L.serif);
    c.globalAlpha = lit(m, 'name'); c.fillStyle = L.text; c.fillText(s.name, M, 300);
    const p = shown(m, 'hook');
    if (p) {
      c.globalAlpha = p * lit(m, 'hook');
      font(c, 38, L.serif, 400, 'italic'); c.fillStyle = L.text;
      wrap(c, s.hook, W - 2 * M - 80).slice(0, 3).forEach((l, i) => c.fillText(l, M, 400 + i * 50 + (1 - p) * 12));
    }
    c.globalAlpha = 1;
  },

  features(c, m, L) {
    const s = m.scene;
    font(c, 52, L.serif); c.fillStyle = L.text; c.fillText('What it gives you', M, 160);
    s.items.forEach((it, i) => {
      const p = shown(m, it.id, i * 700), y = 230 + i * 92;
      if (!p) return;
      c.globalAlpha = p;
      c.fillStyle = L.surface; rr(c, M + (1 - p) * 24, y, W - 2 * M, 72, 12); c.fill(); c.strokeStyle = L.border; c.lineWidth = 1; c.stroke();
      c.fillStyle = L.accent; c.beginPath(); c.arc(M + 34 + (1 - p) * 24, y + 36, 6, 0, 7); c.fill();
      font(c, 28, L.sans, 500); c.fillStyle = L.text; c.fillText(clip(c, it.text, W - 2 * M - 100), M + 64 + (1 - p) * 24, y + 46);
    });
    c.globalAlpha = 1;
  },

  usage(c, m, L) {
    const s = m.scene;
    let y = 120;
    if (s.install) {
      c.globalAlpha = lit(m, 'install');
      font(c, 15, L.mono, 500); c.fillStyle = L.text2; c.fillText('INSTALL', M, y);
      font(c, 24, L.mono, 500);
      const w = c.measureText(`$ ${s.install}`).width + 48;
      c.fillStyle = L.surface; rr(c, M, y + 16, Math.min(w, W - 2 * M), 56, 10); c.fill(); c.strokeStyle = L.border; c.lineWidth = 1; c.stroke();
      c.fillStyle = L.text3; c.fillText('$', M + 22, y + 53); c.fillStyle = L.text; c.fillText(clip(c, s.install, W - 2 * M - 80), M + 46, y + 53);
      y += 110;
    }
    const p = shown(m, 'example');
    if (s.lines.length && p) {
      c.globalAlpha = p * lit(m, 'example');
      font(c, 15, L.mono, 500); c.fillStyle = L.text2; c.fillText('FIRST EXAMPLE, FROM THE README', M, y);
      const n = Math.min(s.lines.length, Math.floor((H - y - 80) / 26)), x = M, top = y + 16, w = W - 2 * M;
      c.fillStyle = L.surface; rr(c, x, top, w, n * 26 + 28, 12); c.fill(); c.strokeStyle = L.border; c.lineWidth = 1; c.stroke();
      // The example types itself in while the sentence about it is said.
      const chars = s.lines.slice(0, n).reduce((t, l) => t + l.length + 1, 0);
      let left = m.reduce ? Infinity : Math.max(0, (m.speechMs + 200) / 1600) * chars;
      for (let i = 0; i < n && left > 0; i++) {
        const ly = top + 34 + i * 26;
        font(c, 18, L.mono);
        let px = x + 24;
        for (const [t, kind] of tokens((s.lines[i] ?? '').slice(0, 96))) {
          if (left <= 0) break;
          const part = t.slice(0, Math.ceil(left));
          c.fillStyle = kind === 'k' ? L.accentText : kind === 's' ? L.verifiedText : kind === 'c' ? L.text3 : kind === 'n' ? L.unverifiedText : L.text;
          c.fillText(part, px, ly); px += c.measureText(part).width; left -= part.length;
        }
        left -= 1;
      }
    }
    c.globalAlpha = 1;
  },

  map(c, m, L) {
    const s = m.scene;
    const l = layout(s.nodes, s.edges.map(e => ({ ...e, verified: true })), 'h');
    const k = Math.min((W - 2 * M) / l.w, 330 / l.h, 1.25), ox = (W - l.w * k) / 2, oy = 100 + (350 - l.h * k) / 2;
    c.save(); c.translate(ox, oy); c.scale(k, k);
    const order = new Map(s.nodes.map(n => [n.id, n.col * 10 + n.row]));
    const rank = [...s.nodes].sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(n => n.id);
    const step = Math.min(260, 1800 / Math.max(1, rank.length));
    const appear = (id: string) => shown(m, id, rank.indexOf(id) * step);
    for (const w of l.wires) {
      const p = Math.min(appear(w.from), appear(w.to));
      if (!p) continue;
      const len = 600;
      c.globalAlpha = Math.min(lit(m, w.from), lit(m, w.to));
      c.strokeStyle = L.borderStrong; c.lineWidth = 1.5 / k;
      c.setLineDash([len, len]); c.lineDashOffset = len * (1 - p);
      c.stroke(new Path2D(w.d)); c.setLineDash([]);
    }
    for (const b of l.boxes) {
      const n = s.nodes.find(x => x.id === b.id)!, p = appear(b.id);
      if (!p) continue;
      const focus = m.b > 0 && m.scene.beats[m.b]!.focus.includes(b.id);
      c.globalAlpha = p * lit(m, b.id);
      c.fillStyle = L.surface2; rr(c, b.x, b.y + (1 - p) * 8, b.w, b.h, 8); c.fill();
      c.strokeStyle = focus ? L.accent : L.border; c.lineWidth = (focus ? 2.5 : 1) / k; c.stroke();
      font(c, 13, L.sans, 500); c.fillStyle = L.text; c.fillText(clip(c, n.label, b.w - 28), b.x + 12, b.y + 19 + (1 - p) * 8);
      font(c, 11, L.mono); c.fillStyle = L.text2; c.fillText(clip(c, n.sub, b.w - 24), b.x + 12, b.y + 34 + (1 - p) * 8);
    }
    c.restore(); c.globalAlpha = 1;
    // What the part being talked about does, in its authors' words, under the map.
    const r = s.roles.find(x => m.scene.beats[m.b]!.focus.includes(x.id) && m.b > 0);
    if (r) {
      const p2 = m.reduce ? 1 : ease((m.speechMs + 200) / 400);
      c.globalAlpha = p2;
      // The authors' words are quoted; what RepoTale read from the code itself is not.
      if (r.quote) font(c, 30, L.serif, 400, 'italic'); else font(c, 24, L.sans);
      c.fillStyle = L.text;
      wrap(c, r.quote ? `“${r.text}”` : r.text, W - 2 * M - 40).slice(0, 3).forEach((line, i) => c.fillText(line, M, 500 + i * (r.quote ? 40 : 34)));
      c.globalAlpha = 1;
    }
  },

  flow(c, m, L) {
    const s = m.scene, n = s.steps.length;
    s.steps.forEach((st, i) => {
      const p = shown(m, st.id), y = 120 + i * 168;
      if (!p) return;
      const on = m.scene.beats[m.b]!.focus.includes(st.id);
      c.globalAlpha = p * (on ? 1 : 0.4);
      if (i > 0) { c.strokeStyle = L.borderStrong; c.lineWidth = 2; c.beginPath(); c.moveTo(M + 22, y - 48); c.lineTo(M + 22, y - 8); c.stroke(); c.fillStyle = L.borderStrong; c.beginPath(); c.moveTo(M + 22, y - 2); c.lineTo(M + 15, y - 12); c.lineTo(M + 29, y - 12); c.fill(); }
      c.fillStyle = on ? L.accent : L.surface2; c.beginPath(); c.arc(M + 22, y + 22, 18, 0, 7); c.fill();
      font(c, 18, L.mono, 600); c.fillStyle = on ? L.bg : L.text2; c.textAlign = 'center'; c.fillText(String(i + 1), M + 22, y + 29); c.textAlign = 'left';
      font(c, 34, L.serif); c.fillStyle = L.text; c.fillText(base(st.file), M + 64, y + 34);
      font(c, 15, L.mono); c.fillStyle = L.text2; c.fillText(clip(c, st.file, 520), M + 64, y + 60);
      if (st.text) { font(c, 22, L.sans); c.fillStyle = L.text; wrap(c, st.text, W - 2 * M - 64).slice(0, 2).forEach((l, j) => c.fillText(l, M + 64, y + 94 + j * 30)); }
    });
    c.globalAlpha = 1;
    void n;
  },

  start(c, m, L) {
    const s = m.scene;
    font(c, 52, L.serif); c.fillStyle = L.text; c.fillText('Where to start reading', M, 160);
    s.items.forEach((it, i) => {
      const p = shown(m, it.id, i * 600), y = 230 + i * 110;
      if (!p) return;
      c.globalAlpha = p;
      font(c, 64, L.serif); c.fillStyle = L.text3; c.fillText(String(i + 1).padStart(2, '0'), M, y + 58);
      font(c, 34, L.serif); c.fillStyle = L.text; c.fillText(base(it.file), M + 110, y + 34);
      font(c, 16, L.mono); c.fillStyle = L.text2; c.fillText(`${clip(c, it.file, 640)}  ·  ${it.minutes} min`, M + 110, y + 62);
    });
    c.globalAlpha = 1;
  },

  reach(c, m, L) {
    const s = m.scene;
    font(c, 15, L.mono, 500); c.fillStyle = L.text2; c.fillText('MOST OF IT LEANS ON', M, 150);
    font(c, 44, L.serif); c.fillStyle = L.text; c.fillText(base(s.center), M, 200);
    const bx = M, bw = W - 2 * M - 220;
    s.bands.forEach((b, i) => {
      const p = shown(m, b.id, i * 450), y = 260 + i * 96;
      if (!p) return;
      c.globalAlpha = p;
      font(c, 15, L.mono, 500); c.fillStyle = L.text2; c.fillText(b.label.toUpperCase(), bx, y);
      c.fillStyle = L.surface2; rr(c, bx, y + 14, bw, 14, 7); c.fill();
      c.fillStyle = i === 0 ? L.accent : L.text2; rr(c, bx, y + 14, Math.max(14, bw * (b.files.length / Math.max(1, s.read)) * p), 14, 7); c.fill();
      font(c, 15, L.mono); c.fillStyle = L.text2;
      c.fillText(clip(c, b.files.slice(0, 4).map(base).join('  ·  ') + (b.files.length > 4 ? `  and ${b.files.length - 4} more` : ''), bw), bx, y + 54);
      font(c, 48, L.serif); c.fillStyle = L.text; c.textAlign = 'right'; c.fillText(String(b.files.length), W - M, y + 32); c.textAlign = 'left';
    });
    const t = shown(m, 'tests', s.bands.length * 450);
    if (t) {
      c.globalAlpha = t;
      font(c, 22, L.sans, 500); c.fillStyle = s.tests ? L.verifiedText : L.unverifiedText;
      c.fillText(s.tests ? `${plural(s.tests, 'test file')} reach it` : 'No test among the files read reaches it', bx, 270 + s.bands.length * 96);
    }
    c.globalAlpha = 1;
  },

  end(c, m, L) {
    const s = m.scene;
    font(c, fitSize(c, s.name, W - 2 * M, 150, L.serif, 64), L.serif); c.fillStyle = L.text; c.fillText(s.name, M, 320);
    font(c, 30, L.serif, 400, 'italic'); c.fillStyle = L.accentText; c.fillText('Every sentence, traced to its line.', M, 380);
    font(c, 18, L.mono); c.fillStyle = L.text2; c.fillText(s.url.replace(/^https:\/\//, ''), M, 430);
  },
};

const KEYWORDS = /^(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|async|await|def|self|None|True|False|in|of|type|interface|public|private|static|func|package|struct|default|try|catch|throw|yield|lambda|with|as|pass|elif|null|undefined|this)$/;
/** A line of code cut into coloured runs: comments, strings, numbers and keywords. */
function tokens(line: string): [string, 'c' | 's' | 'n' | 'k' | 't'][] {
  const out: [string, 'c' | 's' | 'n' | 'k' | 't'][] = [];
  for (const m of line.matchAll(/(\/\/.*|#.*)|('(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?|`[^`]*`?)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)|(\s+|.)/g)) {
    const [t, comment, str, num, word] = m;
    out.push([t, comment ? 'c' : str ? 's' : num ? 'n' : word && KEYWORDS.test(word) ? 'k' : 't']);
  }
  return out;
}
