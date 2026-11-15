// Turns an analysed repository into a film: scenes with narration, each scene citing the files and
// lines it talks about. The same scenes render on a canvas (play, narrate, record to a video file)
// and export as a reporeel storyboard the CLI can render in HD with a real voice.
import { blastRadius, permalink } from './analyze.js';

const C = { bg: '#0d060b', surface: '#1b0e17', plum: '#470c35', ink: '#ffffff', muted: '#9a8f97', accent: '#ff488b' };
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
    say: `This is ${meta.name}: ${hook} Here is how it is built, read straight from its code.` });

  // The running site, one scene per page that could be photographed.
  (opts.shots ?? []).forEach((p, k) => {
    const host = new URL(p.url).host.replace(/^www\./, '');
    const where = p.route === '/' ? 'home page' : `${p.route.replace(/^\/|\.html$/g, '').replace(/[/_-]+/g, ' ')} page`;
    const head = p.heading ? `, which opens with “${p.heading.replace(/[“”"]/g, '')}”` : '';
    // app/blog/page.tsx is "app/blog": the folder is the page's name, the file name says nothing.
    const from = p.file?.replace(/\/(?:\+?page|index)\.[a-z]+$/, '').replace(/\.[a-z]+$/, '');
    S.push({ kind: 'site', heading: p.route, url: p.url, img: p.img,
      say: k === 0 ? `Here it is, running live at ${host}. This is the ${where}${head}.${from ? ` It is defined in ${from}.` : ''}`
        : `Next, the ${where}${head}${from ? `, defined in ${from}` : ''}.`,
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
  if (shown.length > 1) {
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
      say: `Change ${spoken(heart.file)} and ${plural(reach.size, 'file')} can feel it, ${pct} percent of what was read. ${tests.length ? `${plural(tests.length, 'test file')} cover that path.` : 'No test file reaches it, so a change there goes untested.'}`,
      evidence: [...reach.keys()].slice(0, 3).map(f => ({ file: f })) });
  }

  const untested = core.filter(m => model.testsReaching(m.file).length === 0).slice(0, 3);
  S.push({ kind: 'health', heading: 'What to watch', cycles: cycles.slice(0, 3), untested: untested.map(m => m.file),
    say: [cycles.length ? `There ${cycles.length === 1 ? 'is one import cycle' : `are ${cycles.length} import cycles`}, the first running ${cycles[0].loop.map(spoken).join(', then ')}, and back.` : 'There are no import cycles.',
      untested.length ? `${list(untested.map(m => spoken(m.file)))} ${untested.length === 1 ? 'has' : 'have'} no test reaching ${untested.length === 1 ? 'it' : 'them'}.` : core.length ? 'Every core module is reached by a test.' : ''].join(' '),
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
const DISPLAY = s => `800 ${s}px Archivo`;
const TEXT = (s, w = 400) => `${w} ${s}px Archivo`;

function font(ctx, f, condensed) { ctx.font = f; try { ctx.fontStretch = condensed ? 'extra-condensed' : 'normal'; } catch {} }
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
  font(ctx, DISPLAY(22), true); ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText('REPOTALE', M, 74);
  if (opts.captions !== false) {
    // Captions: the sentence being spoken, one band at the bottom.
    const sentences = scene.say.split(/(?<=[.!?])\s+/);
    const at = sentences[Math.min(sentences.length - 1, Math.floor(t * sentences.length))].trim();
    font(ctx, TEXT(26, 500));
    const lines = wrap(ctx, at, W - M * 2 - 48).slice(0, 2);
    const h = lines.length * 36 + 28;
    ctx.fillStyle = 'rgba(13,6,11,0.88)'; ctx.fillRect(M, H - 40 - h, W - M * 2, h);
    ctx.fillStyle = C.ink; lines.forEach((l, k) => ctx.fillText(l, M + 24, H - 40 - h + 40 + k * 36));
  }
}

const DRAW = {
  title(ctx, s, t, ms) {
    const size = fit(ctx, s.heading.toUpperCase(), W - M * 2, 210);
    const reveal = seg(t, 0, 0.25);
    ctx.save(); ctx.beginPath(); ctx.rect(M, 0, (W - M * 2) * reveal + 4, H); ctx.clip();
    font(ctx, DISPLAY(size), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading.toUpperCase(), M, 330);
    ctx.restore();
    ctx.fillStyle = C.accent; ctx.fillRect(M, 360, (W - M * 2) * seg(t, 0.15, 0.4), 10);
    font(ctx, TEXT(34)); ctx.fillStyle = C.ink; ctx.globalAlpha = seg(t, 0.25, 0.45);
    wrap(ctx, s.sub, 900).slice(0, 3).forEach((l, k) => ctx.fillText(l, M, 430 + k * 46));
    ctx.globalAlpha = 1;
  },
  stats(ctx, s, t) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading.toUpperCase(), M, 170);
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
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading.toUpperCase(), M, 170);
    s.items.forEach((it, k) => {
      const p = seg(t, 0.06 + k * 0.07, 0.3 + k * 0.07);
      const col = k % 2, row = Math.floor(k / 2), x = M + col * 580 + (1 - p) * 40, y = 240 + row * 110;
      ctx.globalAlpha = p; ctx.fillStyle = C.surface; ctx.fillRect(x, y, 560, 92);
      ctx.fillStyle = C.accent; ctx.fillRect(x, y, 8, 92);
      font(ctx, DISPLAY(46), true); ctx.fillStyle = C.ink; ctx.fillText(it.name.toUpperCase(), x + 30, y + 54);
      font(ctx, TEXT(19)); ctx.fillStyle = C.muted; ctx.fillText(`${it.proof} · ${it.detail}`.slice(0, 54), x + 30, y + 80);
      ctx.globalAlpha = 1;
    });
  },
  map(ctx, s, t, ms) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading.toUpperCase(), M, 170);
    const n = s.areas.length, gap = 20, bw = (W - M * 2 - gap * (n - 1)) / n;
    const max = Math.max(...s.areas.map(a => a.files.length));
    const pos = new Map();
    s.areas.forEach((a, k) => {
      const p = seg(t, 0.05 + k * 0.06, 0.3 + k * 0.06);
      const h = 110 + 150 * (a.files.length / max), x = M + k * (bw + gap), y = 560 - h;
      pos.set(a.name, { x, y, w: bw, h });
      ctx.globalAlpha = p; ctx.fillStyle = k === n - 1 ? C.plum : C.surface; ctx.fillRect(x, y + (1 - p) * 30, bw, h);
      font(ctx, DISPLAY(Math.min(34, fit(ctx, base(a.name).toUpperCase(), bw - 28, 34, 16))), true); ctx.fillStyle = C.ink;
      ctx.fillText(base(a.name).toUpperCase(), x + 14, y + 40 + (1 - p) * 30);
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
  code(ctx, s, t) {
    font(ctx, DISPLAY(Math.min(64, fit(ctx, base(s.file).toUpperCase(), 560, 64))), true); ctx.fillStyle = C.ink; ctx.fillText(base(s.file).toUpperCase(), M, 170);
    font(ctx, TEXT(20)); ctx.fillStyle = C.muted; ctx.fillText(s.file, M, 204);
    const x = M, y = 236, w = 760, lh = 24;
    ctx.fillStyle = C.surface; ctx.fillRect(x, y, w, s.lines.length * lh + 32);
    const hl = Math.floor(seg(t, 0.15, 0.85) * s.lines.length);
    ctx.fillStyle = C.plum; ctx.fillRect(x, y + 16 + Math.min(hl, s.lines.length - 1) * lh - 4, w, lh);
    ctx.font = '16px "JetBrains Mono", ui-monospace, Consolas, monospace';
    s.lines.forEach((l, k) => {
      ctx.globalAlpha = seg(t, k * 0.02, 0.2 + k * 0.02);
      ctx.fillStyle = C.muted; ctx.fillText(String(s.from + k).padStart(4), x + 12, y + 32 + k * lh);
      ctx.fillStyle = k === 0 ? C.accent : C.ink; ctx.fillText(l.replace(/\t/g, '  ').slice(0, 70), x + 70, y + 32 + k * lh);
    });
    ctx.globalAlpha = seg(t, 0.3, 0.5);
    font(ctx, DISPLAY(200), true); ctx.fillStyle = C.accent; ctx.fillText(String(Math.round(s.users * seg(t, 0.3, 0.7))), 900, 420);
    font(ctx, TEXT(26, 500)); ctx.fillStyle = C.ink; wrap(ctx, `files import it`, 300).forEach((l, k) => ctx.fillText(l, 904, 466 + k * 34));
    ctx.globalAlpha = 1;
  },
  path(ctx, s, t, ms) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading.toUpperCase(), M, 170);
    const n = s.chain.length, bw = Math.min(300, (W - M * 2 - (n - 1) * 56) / n);
    const total = n * bw + (n - 1) * 56, x0 = (W - total) / 2;
    s.chain.forEach((f, k) => {
      const p = seg(t, 0.08 + k * (0.6 / n), 0.2 + k * (0.6 / n));
      const x = x0 + k * (bw + 56), y = 300;
      ctx.globalAlpha = p; ctx.fillStyle = k === n - 1 ? C.accent : C.surface; ctx.fillRect(x, y, bw, 150);
      font(ctx, DISPLAY(fit(ctx, base(f).toUpperCase(), bw - 32, 40, 14)), true); ctx.fillStyle = k === n - 1 ? C.bg : C.ink;
      ctx.fillText(base(f).toUpperCase(), x + 16, y + 60);
      font(ctx, TEXT(16)); ctx.fillStyle = k === n - 1 ? C.bg : C.muted; wrap(ctx, f.split('/').slice(0, -1).join('/') || '(root)', bw - 32).slice(0, 2).forEach((l, j) => ctx.fillText(l, x + 16, y + 92 + j * 22));
      if (k < n - 1) { ctx.fillStyle = C.ink; ctx.fillRect(x + bw + 10, y + 72, 36 * seg(t, 0.2 + k * (0.6 / n), 0.3 + k * (0.6 / n)), 6); }
      ctx.globalAlpha = 1;
    });
  },
  blast(ctx, s, t, ms) {
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading.toUpperCase(), M, 170);
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
    font(ctx, DISPLAY(72), true); ctx.fillStyle = C.ink; ctx.fillText(s.heading.toUpperCase(), M, 170);
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
    ctx.save(); ctx.beginPath(); ctx.rect(x, y + bar, w, h - bar); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y + bar, w, h - bar);
    const img = s.img, scale = (w / img.naturalWidth) * (1.06 - 0.06 * seg(t, 0.05, 0.4));
    const ih = img.naturalHeight * scale, travel = Math.max(0, ih - (h - bar));
    ctx.drawImage(img, x + (w - img.naturalWidth * scale) / 2, y + bar - travel * ease(seg(t, 0.22, 0.96) ** 1.2), img.naturalWidth * scale, ih);
    ctx.restore();
    ctx.globalAlpha = 1;
    // The route, set large on a pink block that fills the right end of the address bar.
    const label = s.heading === '/' ? 'HOME' : s.heading.replace(/\.html$/, '').toUpperCase();
    font(ctx, DISPLAY(34), true); const lw = Math.min(ctx.measureText(label).width + 40, 420);
    const lp = seg(t, 0.1, 0.25), lx = x + w - lw * lp;
    ctx.fillStyle = C.accent; ctx.fillRect(lx, y, lw * lp, bar);
    ctx.save(); ctx.beginPath(); ctx.rect(lx, y, lw * lp, bar); ctx.clip();
    ctx.fillStyle = C.bg; ctx.fillText(label, x + w - lw + 20, y + 34); ctx.restore();
  },
  end(ctx, s, t) {
    ctx.fillStyle = C.plum; ctx.fillRect(0, 0, W, H * seg(t, 0, 0.3));
    const size = fit(ctx, s.heading.toUpperCase(), W - M * 2, 220);
    font(ctx, DISPLAY(size), true); ctx.fillStyle = C.ink; ctx.globalAlpha = seg(t, 0.15, 0.4); ctx.fillText(s.heading.toUpperCase(), M, 360);
    font(ctx, TEXT(32, 500)); ctx.fillText(s.sub, M, 420);
    ctx.fillStyle = C.accent; ctx.fillText('Told by RepoTale', M, 470); ctx.globalAlpha = 1;
  },
};

/** Draw one frame. `t` is 0..1 through the scene, `ms` the absolute clock (for loops). Each scene
 *  after the first opens with a wipe: a plum panel led by a pink edge slides off to the right. */
export function drawFrame(ctx, scenes, i, t, ms, opts = {}) {
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  DRAW[scenes[i].kind](ctx, scenes[i], t, ms);
  chrome(ctx, scenes[i], i, scenes.length, t, opts);
  const el = t * scenes[i].duration;
  if (i > 0 && el < 560 && !opts.poster) {
    const x = W * ease(el / 560);
    ctx.fillStyle = C.plum; ctx.fillRect(x, 0, W - x, H);
    ctx.fillStyle = C.accent; ctx.fillRect(x, 0, 14, H);
  }
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
  play() {
    if (this.playing) return;
    if (this.i === this.scenes.length - 1 && this.elapsed >= this.scene.duration) { this.i = 0; this.elapsed = 0; }
    this.opts.audioContext?.resume();
    this.playing = true; this.t0 = performance.now() - this.elapsed;
    this.speak();
    requestAnimationFrame(this.frame); this.emit();
  }
  pause() { this.playing = false; this.waiting = false; this.hush(); this.draw(); this.emit(); }
  seek(i) {
    this.i = Math.max(0, Math.min(this.scenes.length - 1, i)); this.elapsed = 0; this.t0 = performance.now();
    if (this.playing) this.speak(); else this.hush();
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
      if (this.i === this.scenes.length - 1) { this.elapsed = this.scene.duration; this.playing = false; this.hush(); this.draw(now); this.emit(); this.opts.onEnd?.(); return; }
      this.i++; this.elapsed = 0; this.t0 = now; this.speak(); this.emit();
    }
    this.draw(now);
    requestAnimationFrame(this.frame);
  }
  get total() { return this.scenes.reduce((s, x) => s + x.duration, 0); }
}

/** Record the whole film to a video file in real time. With `audioContext` and every scene carrying
 *  audio, the narration is mixed into the file; otherwise it is silent with captions. */
export async function record(scenes, opts = {}, onProgress = () => {}) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1920, height: 1080 });
  const ctx = canvas.getContext('2d');
  const ac = opts.audioContext, voiced = !!ac && scenes.every(s => s.audio);
  const types = voiced
    ? ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = types.find(t => window.MediaRecorder?.isTypeSupported?.(t));
  if (!mimeType) throw new Error('This browser cannot record video. Try Chrome or Edge.');
  const stream = canvas.captureStream(30);
  let dest = null;
  if (voiced) { await ac.resume(); dest = ac.createMediaStreamDestination(); for (const t of dest.stream.getAudioTracks()) stream.addTrack(t); }
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, ...(voiced ? { audioBitsPerSecond: 192_000 } : {}) });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => { rec.onstop = r; });
  drawFrame(ctx, scenes, 0, 0, 0, opts);
  rec.start(500);
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
      drawFrame(ctx, scenes, i, Math.min(1, (el - acc) / scenes[i].duration), el, opts);
      onProgress(Math.min(1, el / total));
      if (el >= total + 400) return done();
      // Timers keep running when the tab is in the background, unlike animation frames.
      setTimeout(tick, 1000 / 30);
    };
    tick();
  });
  for (const s of sources) try { s.stop(); } catch {}
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
    else if (s.kind === 'site') out.push({ type: 'web', url: s.url, actions: [{ wait: 1200 }, { scroll: 1600 }], ...common });
    else out.push({ type: 'title', heading: s.heading, sub: s.kind === 'path' ? s.chain.map(base).join(' → ') : s.kind === 'blast' ? `${s.reach.length} files reached` : s.kind === 'stack' ? s.items.map(i => i.name).join(' · ') : '', ...common });
  }
  return { $schema: 'https://raw.githubusercontent.com/HarshDubey23/RepoTale/main/schema/reporeel.schema.json', title: model.meta.name, repo: model.meta.full, ...(scenes.some(s => s.kind === 'site') ? { app: { url: model.live } } : {}), voice: { provider: 'kokoro' }, theme: { accent: C.accent }, scenes: out };
}

/** graph.json without the file contents. */
export function graphOf(model) {
  return { repo: model.meta.full, commit: model.meta.sha, modules: model.modules.map(({ text, ...m }) => m), edges: model.edges, areas: model.areas, cycles: model.cycles };
}
