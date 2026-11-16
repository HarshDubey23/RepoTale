// Turns an analysed repository into a film: scenes with narration, each scene citing the files and
// lines it talks about. The same scenes render on a canvas (play, narrate, record to a video file)
// and export as a reporeel storyboard the CLI can render in HD with a real voice.
import { blastRadius, permalink } from './analyze.js';
import { archBeats, drawArchBeat } from './filmarch.js';
import { mermaidArch } from './arch.js';

const C = { bg: '#ffffff', surface: '#ebebeb', plum: '#dedede', ink: '#0d2a1c', muted: '#5f6b64', accent: '#1f6f4a' };
const plural = (n, w, s = w + 's') => `${n.toLocaleString('en')} ${n === 1 ? w : s}`;
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
const base = f => f.split('/').pop();
const spoken = f => base(f).replace(/\.[a-z]+$/, '').replace(/[_-]+/g, ' ').trim() || base(f);

/** Shortest import chain from a to b, or null. */
export function pathBetween(a, b, edges) {
  const prev = new Map([[a, null]]); const q = [a];
  while (q.length) {
    const f = q.shift();
    if (f === b) { const out = []; for (let x = b; x; x = prev.get(x)) out.unshift(x); return out; }
    for (const e of edges) if (e.from === f && !prev.has(e.to)) { prev.set(e.to, f); q.push(e.to); }
  }
  return null;
}

/** The scenes, in order. Every claim in `say` is backed by `evidence`. */
export function buildStory(model, opts = {}) {
  const { meta, totals, core, entries, stack, areas, edges, cycles } = model;
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const S = [];
  const hook = meta.description ? meta.description.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0].replace(/[.!]?$/, '.') :`a ${totals.languages[0]?.[0] ?? 'software'} project.`;
  S.push({ kind: 'title', heading: meta.name, sub: hook, evidence: meta.readmePath ? [{ file: meta.readmePath }] : [],
    say: `This is ${meta.name}: ${hook} In the next minute: how it is built, the one module everything leans on, and what to watch when you change it.` });

  // The running site, one scene per page that could be photographed.
  (opts.shots ?? []).forEach((p, k) => {
    const host = new URL(p.url).host.replace(/^www\./, '');
    const where = p.route === '/' ? 'home page' : `${p.route.replace(/^\/|\.html$/g, '').replace(/[/_-]+/g, ' ')} page`;
    const said = p.read?.h1 ?? p.heading ?? p.read?.title;
    const head = said ? `, which leads with “${said.replace(/[“”"]/g, '')}”` : '';
    const tour = p.read?.sections?.length > 1 ? ` It walks through ${list(p.read.sections.slice(0, 3).map(x => x.toLowerCase()))}.` : p.read?.lead ? ` ${p.read.lead}` : '';
    // app/blog/page.tsx is "app/blog": the folder is the page's name, the file name says nothing.
    const from = p.file?.replace(/\/(?:\+?page|index)\.[a-z]+$/, '').replace(/\.[a-z]+$/, '');
    S.push({ kind: 'site', heading: p.route, url: p.url, img: p.img,
      say: k === 0 ? `Here it is, running live at ${host}. This is the ${where}${head}.${tour}${from ? ` It is defined in ${from}.` : ''}`
        : `Next, the ${where}${head}.${tour}${from ? ` It is defined in ${from}.` : ''}`,
      evidence: p.file ? [{ file: p.file }] : [] });
  });

  S.push({ kind: 'stats', heading: 'By the numbers', items: [
    { value: totals.code, label: 'source files read' }, { value: totals.lines, label: 'lines of code' },
    { value: totals.symbols, label: 'top-level definitions' }, { value: totals.tests, label: 'test files' }],
    say: `It has ${plural(totals.code, 'source file')} and ${plural(totals.lines, 'line')} of code${totals.languages[0] ? `, mostly ${totals.languages[0][0]}` : ''}, with ${plural(totals.tests, 'test file')}.${meta.truncated ? ' This is a sample of the largest part of the repository.' : ''}`,
    evidence: [] });

  if (stack.length) S.push({ kind: 'stack', heading: 'Built with', items: stack.slice(0, 6),
    say: `It is built with ${list(stack.slice(0, 4).map(s => s.name))}. Each of those is named in ${list([...new Set(stack.slice(0, 4).map(s => base(s.proof)))])}.`,
    evidence: [...new Set(stack.slice(0, 4).map(s => s.proof))].map(file => ({ file })) });

  let shown = areas.filter(a => a.files.length - a.tests > 0).slice(0, 7);
  // A flat package has one area; show its most-used files as the parts instead.
  if (shown.length < 2) {
    const top = model.modules.filter(m => !m.test).sort((a, b) => b.importedBy.length + b.imports.length - a.importedBy.length - a.imports.length).slice(0, 6).map(m => m.file);
    // Callers on the left, the most imported on the right.
    shown = top.sort((a, b) => byFile.get(a).importedBy.length - byFile.get(b).importedBy.length).map(f => ({ name: f, files: [f], tests: 0,
      out: edges.filter(e => e.from === f && top.includes(e.to)).map(e => ({ to: e.to, weight: 1 })) }));
  }
  if (opts.arch) {
    // The architecture as one continuous canvas: an overview, then the camera visits each subsystem.
    for (const b of archBeats(opts.arch)) S.push({ kind: 'arch', ...b });
  } else if (shown.length > 1) {
    const flat = shown[0].files.length === 1 && shown[0].name === shown[0].files[0];
    const first = shown[0].name, last = shown.at(-1).name;
    const users = shown.filter(a => a.out.some(o => o.to === last)).length;
    const name = n => flat ? spoken(n) : n;
    S.push({ kind: 'map', heading: 'The architecture', areas: shown,
      say: `${flat ? `It is one package; these are its ${shown.length} busiest files.` : `The code falls into ${plural(shown.length, 'area')}.`} Imports run left to right, from ${name(first)} toward ${name(last)}${users ? `, which ${plural(users, flat ? 'other file' : 'other area')} on screen import` : ''}.`,
      evidence: edges.filter(e => flat ? e.from === first : byFile.get(e.from)?.area === first).slice(0, 2).map(e => ({ file: e.from, line: e.line })) });
  }

  const heart = core[0];
  if (heart) {
    const users = heart.importedBy.filter(f => !byFile.get(f)?.test);
    const syms = heart.symbols.filter(s => s.exported).slice(0, 3);
    const from = syms[0]?.line ?? 1;
    const lines = heart.text.split('\n').slice(from - 1, from + 13);
    S.push({ kind: 'code', heading: heart.file, file: heart.file, from, lines, users: users.length,
      say: `The heart of it is ${spoken(heart.file)}. ${plural(users.length, 'other file')} import it${syms.length ? `, for ${list(syms.map(s => s.name))}` : ''}.`,
      evidence: [{ file: heart.file, line: from, end: from + lines.length - 1 }, ...users.slice(0, 2).map(f => ({ file: f, line: edges.find(e => e.from === f && e.to === heart.file)?.line }))] });
  }

  const entry = entries.find(e => heart && pathBetween(e.file, heart.file, edges)?.length > 2) ?? entries[0];
  const chain = entry && heart ? pathBetween(entry.file, heart.file, edges) : null;
  if (chain && chain.length > 1) S.push({ kind: 'path', heading: 'Follow one path', chain,
    say: `Follow one path. It starts at ${spoken(chain[0])}, which nothing else imports, and reaches the heart in ${plural(chain.length - 1, 'step')}: ${list(chain.map(spoken))}.`,
    evidence: chain.slice(0, -1).map((f, i) => ({ file: f, line: edges.find(e => e.from === f && e.to === chain[i + 1])?.line })) });

  if (heart) {
    const reach = blastRadius(heart.file, edges);
    const tests = [...reach.keys()].filter(f => byFile.get(f)?.test);
    const pct = Math.round((reach.size / Math.max(1, model.modules.length)) * 100);
    S.push({ kind: 'blast', heading: 'If it changes', center: heart.file, reach: [...reach], tests: tests.length,
      say: `Change ${spoken(heart.file)} and ${plural(reach.size, 'file')} can feel it, ${pct} percent of what was read. ${tests.length ? `${plural(tests.length, 'test file')} cover that path.` : meta.truncated ? 'No test among the files read reaches it; this was a sample, so tests elsewhere may.' : 'No test file reaches it, so a change there goes untested.'}`,
      evidence: [...reach.keys()].slice(0, 3).map(f => ({ file: f })) });
  }

  const untested = core.filter(m => model.testsReaching(m.file).length === 0).slice(0, 3);
  S.push({ kind: 'health', heading: 'What to watch', cycles: cycles.slice(0, 3), untested: untested.map(m => m.file),
    say: [cycles.length ? `There ${cycles.length === 1 ? 'is one import cycle' : `are ${cycles.length} import cycles`}, the first running ${cycles[0].loop.map(spoken).join(', then ')}, and back.` : 'There are no import cycles.',
      // On a sample, a missing test may simply not have been read: say what was seen, not a verdict.
      untested.length ? (meta.truncated ? `No test among the files read reaches ${list(untested.map(m => spoken(m.file)))}, though this was a sample.` : `${list(untested.map(m => spoken(m.file)))} ${untested.length === 1 ? 'has' : 'have'} no test reaching ${untested.length === 1 ? 'it' : 'them'}.`) : core.length ? 'Every core module is reached by a test.' : ''].join(' '),
    evidence: [...(cycles[0]?.loop.slice(0, 2) ?? []), ...untested.map(m => m.file)].map(file => ({ file })) });

  S.push({ kind: 'end', heading: meta.name, sub: `github.com/${meta.full}`,
    say: `That is ${meta.name}. Every claim in this film links to the line of code behind it.`, evidence: [] });

  for (const s of S) {
    s.evidence = (s.evidence ?? []).filter(e => e.file && (byFile.has(e.file) || e.file === meta.readmePath || (model.pages ?? []).some(p => p.file === e.file) || /\.(json|txt|toml|mod)$|Dockerfile|workflows/.test(e.file)))
      .map(e => ({ ...e, url: permalink(meta, e.file, e.line, e.end) }));
    const words = s.say.split(/\s+/).length;
    s.duration = Math.max(4200, Math.round((words / 2.55) * 1000) + 900) / (opts.speed ?? 1);
  }
  return S;
}

// ---------------------------------------------------------------- canvas rendering

const W = 1280, H = 720, M = 72;
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => ease((t - a) / (b - a));
const DISPLAY = s => `700 ${s}px 'General Sans'`;
const TEXT = (s, w = 400) => `${w} ${s}px 'General Sans'`;

function font(ctx, f) { ctx.font = f; }
function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}
/** Fit a display line to a width by shrinking from `size`. */
function fit(ctx, text, maxW, size, min = 40) {
  let s = size;
  for (; s > min; s -= 4) { font(ctx, DISPLAY(s), true); if (ctx.measureText(text).width <= maxW) break; }
  return s;
}

function chrome(ctx, scene, i, n, t, opts) {
  // Progress ticks along the top: one per scene.
  const w = (W - M * 2 - (n - 1) * 6) / n;
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = C.surface; ctx.fillRect(M + k * (w + 6), 28, w, 4);
    ctx.fillStyle = k < i ? C.ink : k === i ? C.accent : C.surface;
    ctx.fillRect(M + k * (w + 6), 28, k === i ? w * Math.min(1, t) : k < i ? w : 0, 4);
  }
  // The citation for this moment.
  const ev = scene.evidence[Math.min(scene.evidence.length - 1, Math.floor(t * scene.evidence.length))];
  font(ctx, TEXT(17, 500));
  if (ev) {
    const label = ev.file + (ev.line ? `:${ev.line}` : '');
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = C.surface; ctx.fillRect(W - M - tw - 52, 50, tw + 52, 34);
    ctx.fillStyle = C.accent; ctx.fillRect(W - M - tw - 40, 62, 10, 10);
    ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.fillText(label, W - M - tw - 22, 73);
  }
  font(ctx, DISPLAY(22), true); ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText('RepoTale', M, 74);
  if (opts.captions !== false) captions(ctx, scene, t, opts);
}

/** Captions that follow the voice word by word: the current sentence in a pill, the words already
 *  said in full ink, the rest soft. Timing is spread over the audio by characters, which tracks
 *  Kokoro's even pace closely. */
function captions(ctx, scene, t, opts) {
  const { sentence, local } = spokenAt(scene, t, opts);
  font(ctx, TEXT(26, 600));
  const lines = wrap(ctx, sentence, W - M * 2 - 80).slice(0, 2);
  const lw = Math.max(...lines.map(l => ctx.measureText(l).width)), h = lines.length * 36 + 26, x = (W - lw) / 2 - 24, y = H - 34 - h;
  ctx.fillStyle = 'rgba(13,42,28,0.92)'; ctx.beginPath(); ctx.roundRect(x, y, lw + 48, h, 14); ctx.fill();
  let seen = 0;
  lines.forEach((l, k) => {
    let cx = (W - ctx.measureText(l).width) / 2;
    for (const word of l.split(' ')) {
      ctx.fillStyle = seen + word.length * 0.5 <= local ? '#ffffff' : 'rgba(255,255,255,0.42)';
      ctx.fillText(word, cx, y + 38 + k * 36);
      const ww = ctx.measureText(word + ' ').width; cx += ww; seen += word.length + 1;
    }
  });
}

/** Where a page is worth looking: the two busiest regions, by how much detail (edges) they hold,
 *  measured on a 48-column thumbnail. Headings, product shots and feature grids score high; empty
 *  margins and flat bands score low. Cached on the image. */
export function interest(img, aspect = 2.3) {
  if (img._focus) return img._focus;
  const gw = 48, gh = Math.max(12, Math.round(gw * img.naturalHeight / img.naturalWidth));
  let d;
  try { const c = Object.assign(document.createElement('canvas'), { width: gw, height: gh }), x = c.getContext('2d'); x.drawImage(img, 0, 0, gw, gh); d = x.getImageData(0, 0, gw, gh).data; }
  catch { return img._focus = [{ x: 0.5, y: 0.15 }, { x: 0.5, y: 0.6 }]; }
  const L = (i, j) => { const k = (Math.min(gh - 1, j) * gw + Math.min(gw - 1, i)) * 4; return d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11; };
  const e = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) e[j * gw + i] = Math.abs(L(i + 1, j) - L(i, j)) + Math.abs(L(i, j + 1) - L(i, j));
  const ww = 22, wh = Math.max(4, Math.round(ww / aspect)), wins = [];
  for (let j = 0; j + wh <= gh; j += 2) for (let i = 0; i + ww <= gw; i += 2) {
    let sum = 0; for (let b = j; b < j + wh; b++) for (let a = i; a < i + ww; a++) sum += e[b * gw + a];
    wins.push({ x: (i + ww / 2) / gw, y: (j + wh / 2) / gh, sum });
  }
  wins.sort((a, b) => b.sum - a.sum);
  const one = wins[0] ?? { x: 0.5, y: 0.15 };
  const two = wins.find(w => Math.abs(w.y - one.y) > wh / gh) ?? { x: 0.5, y: Math.min(0.85, one.y + 0.4) };
  return img._focus = [one, two].sort((a, b) => a.y - b.y);
}

/** The camera over a page, at time t: the top of the page, a push in on the busiest region, a
 *  drift to the second, then a pull back that scrolls to the end. Source rectangle in image pixels. */
function camera(img, t, aspect) {
  const iw = img.naturalWidth, ih = img.naturalHeight, focus = interest(img, aspect);
  const view = (cx, cy, z) => {
    const vw = iw / z, vh = vw / aspect;
    return { sx: Math.max(0, Math.min(iw - vw, cx * iw - vw / 2)), sy: Math.max(0, Math.min(Math.max(0, ih - vh), cy * ih - vh / 2)), vw, vh };
  };
  const keys = [[0, view(0.5, 0, 1)], [0.16, view(0.5, 0, 1)], [0.4, view(focus[0].x, focus[0].y, 1.8)], [0.5, view(focus[0].x, focus[0].y, 1.85)],
    [0.72, view(focus[1].x, focus[1].y, 1.35)], [0.8, view(focus[1].x, focus[1].y, 1.38)], [1, view(0.5, 1, 1)]];
  let k = 0; while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
  const [ta, A] = keys[k], [tb, B] = keys[k + 1], u = ease((t - ta) / (tb - ta || 1));
  const mix = n => A[n] + (B[n] - A[n]) * u;
  return { sx: mix('sx'), sy: mix('sy'), vw: mix('vw'), vh: mix('vh'), focus };
}

/** How a scene enters, chosen from what it is and what came before it. */
function enterStyle(prev, kind) {
  if (!prev || (kind === 'arch' && prev === 'arch')) return 'none';
  if (kind === 'site') return prev === 'site' ? 'slide' : 'zoom';
  if (kind === 'arch') return 'iris';
  if (kind === 'end' || kind === 'title') return 'blur';
  if (kind === 'stats' || kind === 'stack') return 'slide';
  if (kind === 'code' || kind === 'path' || kind === 'blast') return 'wipe';
  return 'rise';
}

/** The ground every scene stands on: a slow plum glow and a dot grid, so cuts never feel bare. */
function ground(ctx, ms) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const gx = W * (0.78 + 0.06 * Math.sin(ms / 7000)), gy = H * (0.18 + 0.05 * Math.cos(ms / 9000));
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 620);
  g.addColorStop(0, 'rgba(31,111,74,0.13)'); g.addColorStop(0.5, 'rgba(247,107,21,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(13,42,28,0.07)';
  for (let y = 14; y < H; y += 28) for (let x = 14; x < W; x += 28) ctx.fillRect(x, y, 2, 2);
}

const DRAW = {
  arch(ctx, s, t, ms) { drawArchBeat(ctx, s, t, ms, t * s.duration); },
  title(ctx, s, t, ms) {
    // Each letter rises into place a beat after the one before; the accent bar follows the word.
    const size = fit(ctx, s.heading, W - M * 2, 210);
    font(ctx, DISPLAY(size), true);
    let x = M;
    [...s.heading].forEach((ch, i) => {
      const p = seg(t, 0.02 + i * 0.018, 0.16 + i * 0.018);
      ctx.globalAlpha = p; ctx.fillStyle = C.ink;
      ctx.fillText(ch, x, 330 + (1 - p) * 60);
      x += ctx.measureText(ch).width;
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.accent; ctx.fillRect(M, 360, (x - M) * seg(t, 0.18, 0.42), 10);
    font(ctx, TEXT(34));
    const words = s.sub.split(' '), lines = wrap(ctx, s.sub, 900).slice(0, 3);
    let k = 0;
    lines.forEach((l, li) => { let lx = M; for (const w of l.split(' ')) { const p = seg(t, 0.3 + k * 0.012, 0.4 + k * 0.012); ctx.globalAlpha = p; ctx.fillStyle = C.ink; ctx.fillText(w, lx, 430 + li * 46 + (1 - p) * 12); lx += ctx.measureText(w + ' ').width; k++; } });
    ctx.globalAlpha = 1;
    void words;
  },
  stats(ctx, s, t) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading, M, 170);
    const cw = (W - M * 2) / s.items.length;
    s.items.forEach((it, k) => {
      const p = seg(t, 0.08 + k * 0.08, 0.5 + k * 0.08);
      const x = M + k * cw;
      ctx.fillStyle = k === 0 ? C.plum : C.surface; ctx.fillRect(x, 230, cw - 16, 300 * p);
      font(ctx, DISPLAY(Math.min(120, fit(ctx, Number(it.value).toLocaleString('en'), cw - 56, 120))), true);
      ctx.fillStyle = C.ink; ctx.globalAlpha = p; ctx.fillText(Math.round(it.value * p).toLocaleString('en'), x + 24, 380);
      font(ctx, TEXT(24, 500)); ctx.fillStyle = C.muted; ctx.fillText(it.label, x + 24, 430); ctx.globalAlpha = 1;
    });
  },
  stack(ctx, s, t) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading, M, 170);
    s.items.forEach((it, k) => {
      const p = seg(t, 0.06 + k * 0.07, 0.3 + k * 0.07);
      const col = k % 2, row = Math.floor(k / 2), x = M + col * 580 + (1 - p) * 40, y = 240 + row * 110;
      ctx.globalAlpha = p; ctx.fillStyle = C.surface; ctx.fillRect(x, y, 560, 92);
      ctx.fillStyle = C.accent; ctx.fillRect(x, y, 8, 92);
      font(ctx, DISPLAY(46), true); ctx.fillStyle = C.ink; ctx.fillText(it.name, x + 30, y + 54);
      font(ctx, TEXT(19)); ctx.fillStyle = C.muted; ctx.fillText(`${it.proof} · ${it.detail}`.slice(0, 54), x + 30, y + 80);
      ctx.globalAlpha = 1;
    });
  },
  map(ctx, s, t, ms) {
    if (s.image) {
      // The real architecture diagram: it fades up whole, then the camera eases in and travels
      // across it, so the subsystems are read one after another.
      const img = s.image, top = 96, bot = 590, fw = W - 96, fh = bot - top;
      const fit = Math.min(fw / img.naturalWidth, fh / img.naturalHeight);
      const zoom = 1 + 0.9 * ease(seg(t, 0.2, 0.95)), k = fit * zoom;
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      const u = ease(seg(t, 0.2, 0.98));
      const blend = ease(seg(t, 0.2, 0.45));
      const x = 48 + (fw - w) * (0.5 + (u - 0.5) * blend), y = top + (fh - h) * (0.5 + (0.15 + 0.7 * u - 0.5) * blend);
      ctx.save(); ctx.beginPath(); ctx.rect(48, top, fw, fh); ctx.clip();
      ctx.globalAlpha = seg(t, 0, 0.12);
      ctx.drawImage(img, x, y, w, h);
      ctx.restore(); ctx.globalAlpha = 1;
      return;
    }
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading, M, 170);
    const n = s.areas.length, gap = 20, bw = (W - M * 2 - gap * (n - 1)) / n;
    const max = Math.max(...s.areas.map(a => a.files.length));
    const pos = new Map();
    s.areas.forEach((a, k) => {
      const p = seg(t, 0.05 + k * 0.06, 0.3 + k * 0.06);
      const h = 110 + 150 * (a.files.length / max), x = M + k * (bw + gap), y = 560 - h;
      pos.set(a.name, { x, y, w: bw, h });
      ctx.globalAlpha = p; ctx.fillStyle = k === n - 1 ? C.plum : C.surface; ctx.fillRect(x, y + (1 - p) * 30, bw, h);
      font(ctx, DISPLAY(Math.min(34, fit(ctx, base(a.name), bw - 28, 34, 16))), true); ctx.fillStyle = C.ink;
      ctx.fillText(base(a.name), x + 14, y + 40 + (1 - p) * 30);
      font(ctx, TEXT(17)); ctx.fillStyle = C.muted; ctx.fillText(plural(a.files.length, 'file'), x + 14, y + 66 + (1 - p) * 30);
      // One dot per file, so size reads at a glance.
      ctx.fillStyle = C.ink;
      a.files.slice(0, 60).forEach((_, d) => { const cx = x + 18 + (d % 8) * ((bw - 30) / 8), cy = y + 92 + Math.floor(d / 8) * 14; if (cy < y + h - 8) ctx.fillRect(cx, cy, 6, 6); });
      ctx.globalAlpha = 1;
    });
    // Imports between areas as arcs over the boxes, drawn in as they are spoken; a pulse runs
    // along each from importer to imported. Arcs against the flow are muted.
    const ep = seg(t, 0.4, 0.8);
    for (const a of s.areas) for (const o of a.out) {
      const A = pos.get(a.name), B = pos.get(o.to); if (!A || !B) continue;
      const x1 = A.x + A.w / 2, y1 = A.y, x2 = B.x + B.w / 2, y2 = B.y;
      const lift = 40 + Math.abs(x2 - x1) * 0.22, top = Math.max(230, Math.min(y1, y2) - lift);
      const P = [[x1, y1], [x1, top], [x2, top], [x2, y2]];
      const back = x2 < x1;
      ctx.strokeStyle = back ? C.muted : C.accent; ctx.lineWidth = Math.min(7, 2 + o.weight / 4); ctx.globalAlpha = ep * (back ? 0.6 : 1);
      ctx.beginPath(); ctx.moveTo(...P[0]); ctx.bezierCurveTo(...P[1], ...P[2], ...P[3]); ctx.stroke(); ctx.globalAlpha = 1;
      if (!back && ep > 0.9) {
        const u = ((ms / 1600) + o.weight * 0.13) % 1, b = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3];
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(P.reduce((s, p, k) => s + p[0] * b[k], 0), P.reduce((s, p, k) => s + p[1] * b[k], 0), 6, 0, 7); ctx.fill();
      }
    }
  },
  code(ctx, s, t, ms) {
    font(ctx, DISPLAY(Math.min(64, fit(ctx, base(s.file), 560, 64))), true); ctx.fillStyle = C.ink; ctx.fillText(base(s.file), M, 170);
    font(ctx, TEXT(20)); ctx.fillStyle = C.muted; ctx.fillText(s.file, M, 204);
    // Twelve lines at most, so the editor never reaches the captions.
    const L = s.lines.slice(0, 12), x = M, y = 226, w = 790, lh = 23, n = L.length, pad = 44;
    ctx.fillStyle = '#0d2a1c'; ctx.fillRect(x, y, w, n * lh + pad + 20);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, k) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 22 + k * 18, y + 18, 5, 0, 7); ctx.fill(); });
    font(ctx, TEXT(13, 500)); ctx.fillStyle = '#9fb3a8'; ctx.fillText(s.file, x + 86, y + 23);
    // After typing, a band walks down the lines as the narration talks about them.
    const total = L.reduce((a, l) => a + l.length + 1, 0), typed = seg(t, 0.06, 0.55) * total;
    const band = seg(t, 0.58, 0.95);
    if (band > 0) { ctx.fillStyle = '#1f4a35'; ctx.fillRect(x, y + pad + Math.min(n - 1, Math.floor(band * n)) * lh - 17, w, lh); }
    ctx.font = '15px "JetBrains Mono", ui-monospace, Consolas, monospace';
    let left = typed, cx = 0, cy = 0;
    L.forEach((raw, k) => {
      const l = raw.replace(/\t/g, '  ').slice(0, 72), ly = y + pad + k * lh;
      ctx.fillStyle = '#5f7d6e'; ctx.fillText(String(s.from + k).padStart(4), x + 12, ly);
      if (left <= 0) return;
      let px = x + 66, shown = 0;
      for (const [text, color] of tokens(l)) {
        if (left <= 0) break;
        const part = text.slice(0, Math.max(0, Math.floor(left)));
        ctx.fillStyle = color; ctx.fillText(part, px, ly);
        px += ctx.measureText(part).width; left -= part.length; shown += part.length;
        if (part.length < text.length) break;
      }
      cx = px; cy = ly; left -= 1;
    });
    // The cursor blinks where the typing is.
    if (t < 0.6 && Math.floor((ms ?? 0) / 450) % 2 === 0) { ctx.fillStyle = C.accent; ctx.fillRect(cx + 1, cy - 14, 9, 18); }
    ctx.globalAlpha = seg(t, 0.3, 0.5);
    font(ctx, DISPLAY(200), true); ctx.fillStyle = C.ink; ctx.fillText(String(Math.round(s.users * seg(t, 0.3, 0.7))), 900, 420);
    font(ctx, TEXT(26, 500)); ctx.fillStyle = C.ink; wrap(ctx, `files import it`, 300).forEach((l, k) => ctx.fillText(l, 904, 466 + k * 34));
    ctx.globalAlpha = 1;
  },
  path(ctx, s, t, ms) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading, M, 170);
    const n = s.chain.length, bw = Math.min(300, (W - M * 2 - (n - 1) * 56) / n);
    const total = n * bw + (n - 1) * 56, x0 = (W - total) / 2;
    s.chain.forEach((f, k) => {
      const p = seg(t, 0.08 + k * (0.6 / n), 0.2 + k * (0.6 / n));
      const x = x0 + k * (bw + 56), y = 300;
      ctx.globalAlpha = p; ctx.fillStyle = k === n - 1 ? C.accent : C.surface; ctx.fillRect(x, y, bw, 150);
      font(ctx, DISPLAY(fit(ctx, base(f), bw - 32, 40, 14)), true); ctx.fillStyle = k === n - 1 ? C.bg : C.ink;
      ctx.fillText(base(f), x + 16, y + 60);
      font(ctx, TEXT(16)); ctx.fillStyle = k === n - 1 ? C.bg : C.muted; wrap(ctx, f.split('/').slice(0, -1).join('/') || '(root)', bw - 32).slice(0, 2).forEach((l, j) => ctx.fillText(l, x + 16, y + 92 + j * 22));
      if (k < n - 1) { ctx.fillStyle = C.ink; ctx.fillRect(x + bw + 10, y + 72, 36 * seg(t, 0.2 + k * (0.6 / n), 0.3 + k * (0.6 / n)), 6); }
      ctx.globalAlpha = 1;
    });
  },
  blast(ctx, s, t, ms) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading, M, 170);
    const cx = 860, cy = 360;
    const hops = Math.max(1, ...s.reach.map(r => r[1]));
    for (let h = hops; h >= 1; h--) {
      const r = 50 + h * (170 / hops) * seg(t, 0.1 + h * 0.08, 0.4 + h * 0.08);
      ctx.fillStyle = h % 2 ? C.surface : C.plum; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    }
    s.reach.forEach(([f, h], k) => {
      const p = seg(t, 0.2 + h * 0.1, 0.45 + h * 0.1); if (!p) return;
      const a = k * 2.399, r = 50 + (h - 0.5) * (170 / hops);
      ctx.fillStyle = C.ink; ctx.globalAlpha = p; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    });
    const pulse = 1 + Math.sin(ms / 220) * 0.08;
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(cx, cy, 34 * pulse, 0, 7); ctx.fill();
    font(ctx, DISPLAY(180), true); ctx.fillStyle = C.ink; ctx.fillText(String(Math.round(s.reach.length * seg(t, 0.2, 0.7))), M, 420);
    font(ctx, TEXT(26, 500)); wrap(ctx, `files reached from ${base(s.center)}`, 380).forEach((l, k) => ctx.fillText(l, M + 4, 466 + k * 34));
    ctx.fillStyle = s.tests ? C.ink : C.accent; ctx.fillText(s.tests ? plural(s.tests, 'test file') + ' on the path' : 'no tests on the path', M + 4, 540);
  },
  health(ctx, s, t) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading, M, 170);
    const rows = [
      ...s.cycles.map(c => ({ tag: 'CYCLE', text: (c.loop.length > 4 ? [...c.loop.slice(0, 3).map(base), '…'] : c.loop.map(base)).join(' → ') + ' → ' + base(c.loop[0]) })),
      ...s.untested.map(f => ({ tag: 'UNTESTED', text: f })),
    ];
    if (!rows.length) rows.push({ tag: 'CLEAN', text: 'No import cycles, and every core module is reached by a test.' });
    rows.slice(0, 5).forEach((r, k) => {
      const p = seg(t, 0.08 + k * 0.1, 0.3 + k * 0.1), y = 236 + k * 80;
      ctx.globalAlpha = p; ctx.fillStyle = C.surface; ctx.fillRect(M + (1 - p) * 40, y, W - M * 2, 64);
      font(ctx, DISPLAY(30), true); ctx.fillStyle = r.tag === 'CLEAN' ? C.ink : C.accent; ctx.fillText(r.tag, M + 24 + (1 - p) * 40, y + 42);
      font(ctx, TEXT(22, 500)); ctx.fillStyle = C.ink; ctx.fillText(r.text.slice(0, 80), M + 200 + (1 - p) * 40, y + 41);
      ctx.globalAlpha = 1;
    });
  },
  site(ctx, s, t, ms) {
    // A browser window rises in; inside it the real page scrolls slowly from top to bottom.
    const rise = seg(t, 0, 0.14), x = 96, y = 104 + (1 - rise) * 60, w = W - 192, h = 520, bar = 44;
    ctx.globalAlpha = rise;
    ctx.fillStyle = C.surface; ctx.fillRect(x, y, w, bar);
    [C.accent, C.muted, C.muted].forEach((c, k) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + 24 + k * 22, y + bar / 2, 6, 0, 7); ctx.fill(); });
    ctx.fillStyle = C.bg; ctx.fillRect(x + 100, y + 9, w - 200, bar - 18);
    font(ctx, TEXT(16, 500)); ctx.fillStyle = C.ink; ctx.fillText(s.url.replace(/^https?:\/\//, '').slice(0, 90), x + 116, y + 28);
    ctx.save(); ctx.shadowColor = 'rgba(13,42,28,0.22)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + bar, w, h - bar); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y + bar, w, h - bar); ctx.clip();
    const cam = camera(s.img, t, w / (h - bar));
    ctx.drawImage(s.img, cam.sx, cam.sy, cam.vw, cam.vh, x, y + bar, w, h - bar);
    // The cursor glides to each place the camera chose and clicks it.
    const at = f => [x + (f.x * s.img.naturalWidth - cam.sx) / cam.vw * w, y + bar + (f.y * s.img.naturalHeight - cam.sy) / cam.vh * (h - bar)];
    const [f1, f2] = cam.focus, m1 = seg(t, 0.12, 0.36), m2 = seg(t, 0.52, 0.7);
    const p1 = at(f1), p2 = at(f2), start = [x + w * 0.85, y + h - 30];
    const cx = m2 > 0 ? p1[0] + (p2[0] - p1[0]) * m2 : start[0] + (p1[0] - start[0]) * m1, cy = m2 > 0 ? p1[1] + (p2[1] - p1[1]) * m2 : start[1] + (p1[1] - start[1]) * m1;
    const fade = 1 - seg(t, 0.86, 0.95);
    for (const [a, b] of [[0.36, 0.48], [0.7, 0.82]]) if (t > a && t < b) {
      const r = (t - a) / (b - a);
      ctx.strokeStyle = C.accent; ctx.globalAlpha = (1 - r) * rise; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 8 + r * 34, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = rise * fade;
    ctx.fillStyle = C.ink; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 24); ctx.lineTo(cx + 6.5, cy + 18); ctx.lineTo(cx + 11, cy + 28); ctx.lineTo(cx + 15, cy + 26); ctx.lineTo(cx + 10.5, cy + 16.5); ctx.lineTo(cx + 18, cy + 16.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    // The route, set large on a pink block that fills the right end of the address bar.
    const label = s.heading === '/' ? 'Home' : s.heading.replace(/\.html$/, '');
    font(ctx, DISPLAY(34), true); const lw = Math.min(ctx.measureText(label).width + 40, 420);
    const lp = seg(t, 0.1, 0.25), lx = x + w - lw * lp;
    ctx.fillStyle = C.accent; ctx.fillRect(lx, y, lw * lp, bar);
    ctx.save(); ctx.beginPath(); ctx.rect(lx, y, lw * lp, bar); ctx.clip();
    ctx.fillStyle = C.bg; ctx.fillText(label, x + w - lw + 20, y + 34); ctx.restore();
  },
  end(ctx, s, t) {
    ctx.fillStyle = C.plum; ctx.fillRect(0, 0, W, H * seg(t, 0, 0.3));
    const size = fit(ctx, s.heading, W - M * 2, 220);
    font(ctx, DISPLAY(size), true); ctx.fillStyle = C.ink; ctx.globalAlpha = seg(t, 0.15, 0.4); ctx.fillText(s.heading, M, 360);
    font(ctx, TEXT(32, 500)); ctx.fillText(s.sub, M, 420);
    ctx.fillStyle = C.accent; ctx.fillText('Told by RepoTale', M, 470); ctx.globalAlpha = 1;
  },
};

/** A film of a website: a title, then each page in depth (what it leads with, what it says,
 *  how it is organised, its key points), then an ending. */
/** When a page could not be photographed: the page drawn from what it says, as a tall image the
 *  camera can travel over like a screenshot. */
function pageCard(r, url) {
  const W2 = 1280, c = document.createElement('canvas'), x = c.getContext('2d');
  const blocks = [['h1', r.h1 ?? r.title ?? url], ...(r.lead ? [['p', r.lead]] : []), ...r.sections.flatMap(sec => [['h2', sec]]), ...(r.points ?? []).map(pt => ['li', pt])];
  const style = { h1: ["700 64px 'General Sans'", 76, 40], h2: ["600 34px 'General Sans'", 44, 36], p: ["400 26px 'General Sans'", 38, 28], li: ["400 24px 'General Sans'", 34, 14] };
  const lay = [];
  let y = 120;
  for (const [k, text] of blocks) {
    x.font = style[k][0];
    const lines = wrap(x, (k === 'li' ? '•  ' : '') + text, W2 - 240);
    lay.push([k, lines, y]); y += lines.length * style[k][1] + style[k][2];
  }
  c.width = W2; c.height = Math.max(900, y + 120);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#ebebeb'; x.fillRect(0, 0, c.width, 64);
  x.font = "600 18px 'General Sans'"; x.fillStyle = '#0d2a1c'; x.fillText(new URL(url).host, 120, 40);
  for (const [k, lines, y0] of lay) {
    x.font = style[k][0]; x.fillStyle = k === 'p' || k === 'li' ? '#33463c' : '#0d2a1c';
    lines.forEach((l, i) => x.fillText(l, 120, y0 + style[k][1] * (i + 0.8)));
  }
  c.naturalWidth = c.width; c.naturalHeight = c.height;
  return c;
}

export function buildSiteStory(site) {
  // A heading or bullet on several pages is the site's menu or footer, not what a page is about.
  const seen = new Map();
  for (const p of site.pages) for (const x of new Set([...p.read.sections, ...(p.read.points ?? [])])) seen.set(x, (seen.get(x) ?? 0) + 1);
  const own = a => site.pages.length > 2 ? a.filter(x => seen.get(x) < 2) : a;
  site.pages.forEach(p => { p.read = { ...p.read, sections: own(p.read.sections), points: own(p.read.points ?? []) }; });
  const S = [];
  const name = site.title?.split(/\s[|–—·-]\s/)[0]?.trim() || site.host;
  S.push({ kind: 'title', heading: name, sub: `${site.host} · ${plural(site.pages.length, 'page')}`, evidence: [{ file: site.host, url: site.start }],
    say: `This is ${name}, at ${site.host}. We will walk through ${plural(site.pages.length, 'page')} and see what each one says and offers.` });
  site.pages.forEach((p, k) => {
    const r = p.read;
    const where = p.route === '/' ? 'home page' : `${p.route.replace(/^\/|\/$|\.html$/g, '').split('/').pop().replace(/[-_]+/g, ' ')} page`;
    const bits = [k === 0 ? `We start on the ${where}.` : `Next, the ${where}.`];
    if (r.h1) bits.push(`It leads with “${r.h1.replace(/[“”"]/g, '')}”.`);
    if (r.lead) bits.push(r.lead);
    if (r.sections.length > 1) bits.push(`The page is organised into ${list(r.sections.slice(0, 4).map(x => x.toLowerCase()))}.`);
    if (r.points?.length) bits.push(`Key points: ${r.points.slice(0, 3).map(x => x.replace(/[.;:]$/, '')).join('; ')}.`);
    S.push({ kind: 'site', heading: p.route, url: p.url, img: p.img ?? pageCard(r, p.url), say: bits.join(' '), evidence: [{ file: p.route, url: p.url }] });
  });
  S.push({ kind: 'end', heading: name, sub: site.host, evidence: [],
    say: `That is ${name}: ${plural(site.pages.length, 'page')}, each read from the live site.` });
  for (const x of S) x.duration = Math.max(4200, Math.min(26000, 1400 + x.say.split(/\s+/).length * 330));
  return S;
}

/** Colour a line of code: comments, strings, numbers and keywords, the rest in the editor's ink. */
const KEYWORDS = /^(import|export|from|const|let|var|function|return|if|else|for|while|class|extends|new|async|await|def|self|None|True|False|in|of|type|interface|public|private|static|func|package|struct|go|default|try|catch|throw|yield|lambda|with|as|pass|elif|null|undefined|this)$/;
function tokens(line) {
  const out = [], re = /(\/\/.*|#.*)|('(?:[^'\\]|\\.)*'?|"(?:[^"\\]|\\.)*"?|`[^`]*`?)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)|(\s+|.)/g;
  for (const m of line.matchAll(re)) {
    const [t, comment, str, num, word] = m;
    out.push([t, comment ? '#7f9a8c' : str ? '#9be7b4' : num ? '#ffb38a' : word && KEYWORDS.test(word) ? '#f6e016' : '#e8f0ea']);
  }
  return out;
}

/** The sentence being spoken at time t, and how far into it the voice is. */
function spokenAt(scene, t, opts) {
  const el = t * scene.duration;
  const speak = scene.audio ? scene.audio.duration * 1000 : scene.duration - 650;
  const spoken = opts.poster ? 1 : Math.min(1, el / Math.max(1, speak));
  const sentences = scene.say.split(/(?<=[.!?])\s+/);
  const pos = spoken * scene.say.length;
  let start = 0, idx = 0;
  for (; idx < sentences.length - 1; idx++) { if (start + sentences[idx].length >= pos) break; start += sentences[idx].length + 1; }
  return { sentence: sentences[idx], local: pos - start };
}

/** Draw one frame. `t` is 0..1 through the scene, `ms` the absolute clock (for loops). Each scene
 *  after the first opens with a wipe: a plum panel led by a pink edge slides off to the right. */
export function drawFrame(ctx, scenes, i, t, ms, opts = {}) {
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
  ground(ctx, ms);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // Scenes rise in softly; one architecture beat flows into the next through the camera instead.
  const el = t * scenes[i].duration;
  const style = enterStyle(scenes[i - 1]?.kind, scenes[i].kind), p = opts.poster || style === 'none' ? 1 : ease(el / 700);
  ctx.save();
  if (p < 1) {
    if (style === 'zoom') { ctx.globalAlpha = p; ctx.translate(W / 2, H / 2); ctx.scale(1.1 - 0.1 * p, 1.1 - 0.1 * p); ctx.translate(-W / 2, -H / 2); }
    else if (style === 'iris') { ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * p, 0, 7); ctx.clip(); ground(ctx, ms); }
    else if (style === 'slide') { ctx.globalAlpha = p; ctx.translate((1 - p) * (i % 2 ? -110 : 110), 0); }
    else if (style === 'blur') { ctx.globalAlpha = p; ctx.filter = `blur(${(1 - p) * 16}px)`; }
    else if (style === 'wipe') { ctx.beginPath(); ctx.rect(0, 0, W * p, H); ctx.clip(); }
    else { ctx.globalAlpha = p; ctx.translate(0, (1 - p) * 28); }
  }
  DRAW[scenes[i].kind](ctx, scenes[i], t, ms);
  ctx.restore(); ctx.globalAlpha = 1; ctx.filter = 'none';
  chrome(ctx, scenes[i], i, scenes.length, t, opts);
  if (opts.waiting) {
    font(ctx, TEXT(20, 600)); const label = 'Preparing the voice…', w = ctx.measureText(label).width + 48;
    ctx.fillStyle = C.accent; ctx.fillRect(W / 2 - w / 2, H / 2 - 26, w, 52);
    ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.fillText(label, W / 2, H / 2 + 7); ctx.textAlign = 'left';
  }
}

/** Plays scenes on a canvas. Narration is either a neural voice (each scene carries an AudioBuffer
 *  and lasts as long as its audio), the browser's own voice, or nothing. A scene never ends before
 *  its sentence does, so voice and picture stay together. */
export class Player {
  constructor(canvas, scenes, opts = {}) {
    Object.assign(this, { canvas, ctx: canvas.getContext('2d'), scenes, opts, i: 0, t0: 0, elapsed: 0, playing: false, spoken: true, waiting: false, src: null, listeners: new Set() });
    this.frame = this.frame.bind(this);
    this.draw();
  }
  on(f) { this.listeners.add(f); return () => this.listeners.delete(f); }
  emit() { for (const f of this.listeners) f(this); }
  get scene() { return this.scenes[this.i]; }
  get mode() { return !this.opts.voice ? 'off' : this.opts.voiceName === 'browser' ? 'browser' : 'neural'; }
  // A paused scene that has not started shows its finished frame, so it reads as a poster.
  draw(ms = performance.now()) {
    const poster = !this.playing && this.elapsed === 0;
    drawFrame(this.ctx, this.scenes, this.i, poster ? 0.92 : Math.min(1, this.elapsed / this.scene.duration), ms, { ...this.opts, poster, waiting: this.playing && this.waiting });
  }
  hush() {
    if (this.src) { try { this.src.stop(); } catch {} this.src = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  speak() {
    this.hush(); this.spoken = true; this.waiting = false;
    if (this.mode === 'neural') {
      if (!this.scene.audio) { this.waiting = true; return; }
      const ac = this.opts.audioContext;
      this.src = ac.createBufferSource(); this.src.buffer = this.scene.audio; this.src.connect(ac.destination);
      this.src.start(0, Math.min(this.elapsed / 1000, this.scene.audio.duration));
    } else if (this.mode === 'browser' && 'speechSynthesis' in window && this.elapsed < 200) {
      const u = new SpeechSynthesisUtterance(this.scene.say);
      const v = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
      u.voice = v.find(v => /natural|neural|google|samantha|daniel|aria|jenny/i.test(v.name)) ?? v[0] ?? null;
      u.rate = 1.02; this.spoken = false;
      u.onend = u.onerror = () => { this.spoken = true; };
      speechSynthesis.speak(u);
    }
  }
  /** The score, from where the film is now. `opts.music()` returns the rendered buffer, or null while it renders. */
  music() {
    this.quiet();
    const ac = this.opts.audioContext, buf = this.opts.music?.();
    if (!ac || !buf || !this.playing) return;
    this.mus = ac.createBufferSource(); this.mus.buffer = buf; this.mus.connect(ac.destination);
    this.mus.start(0, Math.min(this.time / 1000, buf.duration - 0.05));
  }
  quiet() { try { this.mus?.stop(); } catch {} this.mus = null; }
  play() {
    if (this.playing) return;
    if (this.i === this.scenes.length - 1 && this.elapsed >= this.scene.duration) { this.i = 0; this.elapsed = 0; }
    this.opts.audioContext?.resume();
    this.playing = true; this.t0 = performance.now() - this.elapsed;
    this.speak(); this.music();
    requestAnimationFrame(this.frame); this.emit();
  }
  pause() { this.playing = false; this.waiting = false; this.hush(); this.quiet(); this.draw(); this.emit(); }
  seek(i) {
    this.i = Math.max(0, Math.min(this.scenes.length - 1, i)); this.elapsed = 0; this.t0 = performance.now();
    if (this.playing) { this.speak(); this.music(); } else this.hush();
    this.draw(); this.emit();
  }
  frame(now) {
    if (!this.playing) return;
    if (this.waiting) {
      // Hold the scene at its start until its audio arrives.
      if (this.scene.audio) { this.elapsed = 0; this.t0 = now; this.speak(); this.emit(); }
      else this.t0 = now - this.elapsed;
    }
    this.elapsed = now - this.t0;
    if (!this.waiting && this.elapsed >= this.scene.duration && this.spoken) {
      if (this.i === this.scenes.length - 1) { this.elapsed = this.scene.duration; this.playing = false; this.hush(); this.quiet(); this.draw(now); this.emit(); this.opts.onEnd?.(); return; }
      this.i++; this.elapsed = 0; this.t0 = now; this.speak(); this.emit();
    }
    this.draw(now);
    requestAnimationFrame(this.frame);
  }
  get total() { return this.scenes.reduce((s, x) => s + x.duration, 0); }
  get time() { return this.scenes.slice(0, this.i).reduce((s, x) => s + x.duration, 0) + this.elapsed; }
  /** Jump to any moment of the film; the voice picks up mid-sentence when it is neural. */
  seekTo(ms) {
    let i = 0;
    while (i < this.scenes.length - 1 && ms >= this.scenes[i].duration) { ms -= this.scenes[i].duration; i++; }
    this.i = i; this.elapsed = Math.max(0, Math.min(ms, this.scene.duration)); this.t0 = performance.now() - this.elapsed;
    if (this.playing) { this.speak(); this.music(); } else this.hush();
    this.draw(); this.emit();
  }
}

/** The vertical frame: the film's name and the scene's heading on top, the 16:9 film in the
 *  middle, and the sentence being spoken set large below, the words already said in full ink. */
function portrait(ctx, film, scenes, i, t, opts) {
  const VW = 1080, VH = 1920, s = scenes[i];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = C.accent; ctx.fillRect(0, 0, VW * ((i + t) / scenes.length), 14);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `700 92px 'General Sans'`; ctx.fillStyle = C.ink;
  const name = opts.title ?? scenes[0].heading;
  ctx.fillText(name.length > 18 ? name.slice(0, 17) + '…' : name, 64, 250);
  ctx.font = `600 40px 'General Sans'`; ctx.fillStyle = C.muted;
  ctx.fillText(String(s.heading ?? '').slice(0, 40), 64, 320);
  ctx.drawImage(film, 0, 470, VW, VW * 9 / 16);
  const { sentence, local } = spokenAt(s, t, opts);
  ctx.font = `700 54px 'General Sans'`;
  const lines = wrap(ctx, sentence, VW - 128).slice(0, 6);
  let seen = 0;
  lines.forEach((l, k) => {
    let x = 64;
    for (const w of l.split(' ')) { ctx.fillStyle = seen + w.length * 0.5 <= local ? C.ink : 'rgba(13,42,28,0.28)'; ctx.fillText(w, x, 1220 + k * 72); x += ctx.measureText(w + ' ').width; seen += w.length + 1; }
  });
  ctx.font = `500 34px 'General Sans'`; ctx.fillStyle = C.muted; ctx.fillText('Made with RepoTale', 64, VH - 90);
}

/** Record the whole film to a video file in real time. With `audioContext` and every scene carrying
 *  audio, the narration is mixed into the file; otherwise it is silent with captions. */
export async function record(scenes, opts = {}, onProgress = () => {}) {
  // A vertical cut (9:16) frames the film between a title and large captions, for phones.
  const vertical = !!opts.vertical;
  const canvas = Object.assign(document.createElement('canvas'), vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 });
  const ctx = canvas.getContext('2d');
  const inner = vertical ? Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 }) : canvas, ictx = inner.getContext('2d');
  const ac = opts.audioContext, voiced = !!ac && scenes.every(s => s.audio), music = ac ? opts.musicBuffer : null;
  const sound = voiced || !!music;
  const types = sound
    ? ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = types.find(t => window.MediaRecorder?.isTypeSupported?.(t));
  if (!mimeType) throw new Error('This browser cannot record video. Try Chrome or Edge.');
  const stream = canvas.captureStream(30);
  let dest = null;
  if (sound) { await ac.resume(); dest = ac.createMediaStreamDestination(); for (const t of dest.stream.getAudioTracks()) stream.addTrack(t); }
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, ...(sound ? { audioBitsPerSecond: 192_000 } : {}) });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => { rec.onstop = r; });
  const paint = (i, t, el) => { drawFrame(ictx, scenes, i, t, el, vertical ? { ...opts, captions: false } : opts); if (vertical) portrait(ctx, inner, scenes, i, t, opts); };
  paint(0, 0, 0);
  rec.start(500);
  if (music) { const m = ac.createBufferSource(); m.buffer = music; m.connect(dest); m.start(); var musicSrc = m; }
  const total = scenes.reduce((s, x) => s + x.duration, 0);
  const start = performance.now();
  let started = -1;
  const sources = [];
  await new Promise(done => {
    const tick = () => {
      if (opts.signal?.aborted) return done();
      const el = performance.now() - start;
      let acc = 0, i = 0;
      while (i < scenes.length - 1 && el > acc + scenes[i].duration) acc += scenes[i++].duration;
      if (voiced && i > started) {
        started = i;
        const src = ac.createBufferSource(); src.buffer = scenes[i].audio; src.connect(dest); src.start(); sources.push(src);
      }
      paint(i, Math.min(1, (el - acc) / scenes[i].duration), el);
      onProgress(Math.min(1, el / total));
      if (el >= total + 400) return done();
      // Timers keep running when the tab is in the background, unlike animation frames.
      setTimeout(tick, 1000 / 30);
    };
    tick();
  });
  for (const s of sources) try { s.stop(); } catch {}
  try { musicSrc?.stop(); } catch {}
  rec.stop(); await stopped;
  if (opts.signal?.aborted) return null;
  return new Blob(chunks, { type: mimeType.split(';')[0] });
}

// ---------------------------------------------------------------- exports

export function mermaidOf(model) {
  const id = n => 'a' + [...n].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  const shown = model.areas.filter(a => a.files.length - a.tests > 0).slice(0, 12);
  const names = new Set(shown.map(a => a.name));
  const lines = ['flowchart LR'];
  for (const a of shown) lines.push(`  ${id(a.name)}["${a.name} (${a.files.length - a.tests})"]`);
  for (const a of shown) for (const o of a.out) if (names.has(o.to)) lines.push(`  ${id(a.name)} -->|${o.weight}| ${id(o.to)}`);
  return lines.join('\n');
}

/** A storyboard for the reporeel CLI: run it inside a clone to render the film in HD with a voice. */
export function storyboardOf(model, scenes) {
  const ev = s => s.evidence.filter(e => model.modules.some(m => m.file === e.file)).map(e => ({ kind: model.modules.find(m => m.file === e.file).test ? 'test' : 'file', id: e.file, ...(e.line ? { lines: [e.line, e.end ?? e.line] } : {}) }));
  const out = [];
  for (const s of scenes) {
    const common = { say: s.say, ...(ev(s).length ? { evidence: ev(s) } : {}) };
    if (s.kind === 'title') out.push({ type: 'title', heading: s.heading, sub: s.sub, ...common });
    else if (s.kind === 'stats') out.push({ type: 'stats', heading: s.heading, items: s.items.map(i => ({ value: Number(i.value).toLocaleString('en'), label: i.label })), ...common });
    else if (s.kind === 'map') out.push({ type: 'diagram', mermaid: mermaidOf(model), caption: 'Areas of the code and the imports between them', ...common });
    else if (s.kind === 'code') out.push({ type: 'code', file: s.file, lines: [s.from, s.from + s.lines.length - 1], highlight: [[s.from, s.from]], ...common });
    else if (s.kind === 'end') out.push({ type: 'end', heading: s.heading, links: [s.sub], ...common });
    else if (s.kind === 'arch' && s.beat === 0) out.push({ type: 'diagram', mermaid: mermaidArch(s.arch), caption: 'The architecture', ...common });
    else if (s.kind === 'site') out.push({ type: 'web', url: s.url, actions: [{ wait: 1200 }, { scroll: 1600 }], ...common });
    else out.push({ type: 'title', heading: s.heading, sub: s.kind === 'path' ? s.chain.map(base).join(' → ') : s.kind === 'blast' ? `${s.reach.length} files reached` : s.kind === 'stack' ? s.items.map(i => i.name).join(' · ') : '', ...common });
  }
  return { $schema: 'https://raw.githubusercontent.com/HarshDubey23/RepoTale/main/schema/reporeel.schema.json', title: model.meta.name, repo: model.meta.full, ...(scenes.some(s => s.kind === 'site') ? { app: { url: model.live } } : {}), voice: { provider: 'kokoro' }, theme: { accent: C.accent }, scenes: out };
}

/** graph.json without the file contents. */
export function graphOf(model) {
  return { repo: model.meta.full, commit: model.meta.sha, modules: model.modules.map(({ text, ...m }) => m), edges: model.edges, areas: model.areas, cycles: model.cycles };
}
