// The architecture, told on one continuous canvas: the whole system builds itself (subsystems,
// then components, then the arrows drawing in), and the camera then flies from subsystem to
// subsystem while the narration names its parts and the real imports between them. Consecutive
// beats share the canvas, so the camera move is the transition.

import { shapeOf, textTop } from './arch.js';

const C = { bg: '#f2eee6', node: '#fffdf8', node2: '#e8e2d5', ink: '#15130f', muted: '#6a6357', edge: '#8a8274', accent: '#2b44ff' };
const W = 1280, H = 720;
const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => ease((t - a) / (b - a));
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);
const plural = (n, w) => `${n} ${n === 1 ? w : w + 's'}`;
const ear = n => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_$]+/g, ' ').toLowerCase().trim();

function bounds(rects, pad = 40) {
  const x0 = Math.min(...rects.map(r => r.x)) - pad, y0 = Math.min(...rects.map(r => r.y)) - pad;
  const x1 = Math.max(...rects.map(r => r.x + r.w)) + pad, y1 = Math.max(...rects.map(r => r.y + r.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The beats: one overview, then the busiest subsystems, then the outside services. */
export function archBeats(arch, lay) {
  const box = id => lay.boxes.get(id);
  const title = id => (arch.nodes.find(n => n.id === id) ?? arch.services.find(s => s.id === id) ?? arch.actor)?.title ?? id;
  const all = bounds([...lay.boxes.values()], 30);
  const beats = [];
  const svcNames = arch.services.map(s => s.title);
  beats.push({ focus: all, highlight: null,
    heading: 'The architecture',
    say: `Here is the whole system: ${plural(arch.groups.length, 'subsystem')}, ${list(arch.groups.slice(0, 4).map(g => g.label))}${arch.groups.length > 4 ? ', and more' : ''}.${svcNames.length ? ` It reaches out to ${list(svcNames.slice(0, 3))}.` : ''}`,
    evidence: [] });
  const busy = [...arch.groups].map(g => ({ g, n: arch.edges.filter(e => arch.nodes.some(n => n.group === g.id && (n.id === e.from || n.id === e.to))).length }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map(x => x.g);
  for (const g of busy) {
    const members = arch.nodes.filter(n => n.group === g.id).sort((a, b) => b.users - a.users);
    const ids = new Set(members.map(n => n.id));
    const out = arch.edges.filter(e => ids.has(e.from) && !e.external && e.from !== 'actor').sort((a, b) => b.count - a.count)[0];
    const link = out ? `${title(out.from)} uses ${title(out.to)}${out.label && !/imports?$/.test(out.label) ? `, for ${list(out.label.replace(/ \+\d+$/, '').split(', ').map(ear))}` : ''}.` : '';
    const near = [g.id, ...members.map(n => n.id), ...(out ? [out.to] : [])].map(box).filter(Boolean);
    beats.push({ focus: bounds(near, 60), highlight: g.id,
      heading: g.label,
      say: `${g.label}: ${list(members.slice(0, 3).map(n => n.title.toLowerCase()))}${members.length > 3 ? `, and ${members.length - 3} more` : ''}. ${link}`,
      evidence: [...(out?.at ? [{ file: out.at, line: out.line }] : []), ...members.slice(0, 2).map(n => ({ file: n.file }))] });
  }
  if (arch.services.length) {
    const ids = arch.services.map(s => s.id);
    const users = arch.edges.filter(e => ids.includes(e.to));
    const near = [...ids, ...users.map(e => e.from)].map(box).filter(Boolean);
    beats.push({ focus: bounds(near, 60), highlight: 'services',
      heading: 'Outside the code',
      say: `Beyond its own code, ${list(users.slice(0, 3).map(e => `${title(e.from).toLowerCase()} ${e.label} ${title(e.to)}`))}.`,
      evidence: users.slice(0, 2).filter(e => e.at).map(e => ({ file: e.at })) });
  }
  beats.forEach((b, i) => { b.from = i ? beats[i - 1].focus : b.focus; b.beat = i; });
  return beats;
}

// ---------------------------------------------------------------- drawing

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function polyLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
/** Draw a polyline up to `f` of its length; returns the point and direction where it stops. */
function partial(ctx, pts, f) {
  const total = polyLength(pts) * f;
  let run = 0; ctx.beginPath(); ctx.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], l = Math.hypot(x1 - x0, y1 - y0);
    if (run + l >= total) { const u = (total - run) / (l || 1), x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u; ctx.lineTo(x, y); ctx.stroke(); return [x, y, x1 - x0, y1 - y0]; }
    ctx.lineTo(x1, y1); run += l;
  }
  ctx.stroke();
  const [a, b] = [pts.at(-2), pts.at(-1)];
  return [b[0], b[1], b[0] - a[0], b[1] - a[1]];
}
function arrowHead(ctx, x, y, dx, dy, size, color) {
  const a = Math.atan2(dy, dx);
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x - size * Math.cos(a - 0.45), y - size * Math.sin(a - 0.45)); ctx.lineTo(x - size * Math.cos(a + 0.45), y - size * Math.sin(a + 0.45));
  ctx.closePath(); ctx.fill();
}

/** One frame of an architecture beat. `el` is milliseconds into the beat. */
export function drawArchBeat(ctx, s, t, ms, el) {
  const { arch, lay } = s;
  const fx = 40, fy = 92, fw = W - 80, fh = H - 92 - 140;
  // Camera: ease from the previous beat's view to this one over the first 1.1 seconds.
  const c = s.beat === 0 ? 1 : ease(el / 1100);
  const f = { x: s.from.x + (s.focus.x - s.from.x) * c, y: s.from.y + (s.focus.y - s.from.y) * c, w: s.from.w + (s.focus.w - s.from.w) * c, h: s.from.h + (s.focus.h - s.from.h) * c };
  const k = Math.min(fw / f.w, fh / f.h, 1.6);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, fy - 20, W, fh + 40); ctx.clip();
  ctx.translate(fx + fw / 2 - (f.x + f.w / 2) * k, fy + fh / 2 - (f.y + f.h / 2) * k);
  ctx.scale(k, k);
  // How far the build has got: complete after the overview.
  const build = s.beat === 0 ? t : 1;
  const color = new Map([...arch.groups.map(g => [g.id, g.color]), ...arch.nodes.map(n => [n.id, n.color])]);
  const lit = id => !s.highlight || s.highlight === id || (s.highlight === 'services' ? id.startsWith('svc:') || arch.edges.some(e => e.to.startsWith('svc:') && e.from === id) : arch.nodes.find(n => n.id === id)?.group === s.highlight);
  const dim = s.beat === 0 ? 1 : 0.22 + 0.78 * (1 - ease((el - 400) / 900));
  const alphaFor = id => lit(id) ? 1 : dim;

  arch.groups.forEach((g, i) => {
    const b = lay.boxes.get(g.id); if (!b) return;
    const a = seg(build, 0.02 + i * 0.03, 0.2 + i * 0.03) * alphaFor(g.id === s.highlight ? g.id : arch.nodes.find(n => n.group === g.id)?.id ?? g.id);
    if (!a) return;
    ctx.globalAlpha = a;
    rr(ctx, b.x, b.y, b.w, b.h, 18); ctx.fillStyle = g.color + '14'; ctx.fill(); ctx.strokeStyle = g.color + '66'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = g.color; ctx.beginPath(); ctx.arc(b.x + 26, b.y + 29, 6, 0, 7); ctx.fill();
    ctx.font = "600 17px 'Inter Tight'"; ctx.fillStyle = C.ink; ctx.fillText(g.label, b.x + 42, b.y + 35);
  });
  const eById = new Map(arch.edges.map(e => [e.id, e]));
  lay.edges.forEach((e, i) => {
    const a = eById.get(e.id);
    const p = seg(build, 0.42 + (i / lay.edges.length) * 0.35, 0.55 + (i / lay.edges.length) * 0.35); if (!p) return;
    const on = lit(a.from) || lit(a.to);
    const col = a.external ? C.edge : a.from === 'actor' ? C.ink : color.get(a.from) ?? C.edge;
    ctx.globalAlpha = on ? 0.9 : dim * 0.6;
    ctx.strokeStyle = col; ctx.lineWidth = Math.min(3.4, 1.6 + a.count * 0.25); ctx.setLineDash(a.external ? [6, 5] : []);
    const [x, y, dx, dy] = partial(ctx, e.pts, p);
    ctx.setLineDash([]);
    arrowHead(ctx, x, y, dx, dy, 11, col);
    // In a lit beat, a pulse runs along each lit arrow.
    if (s.beat > 0 && on && p === 1) {
      const L = polyLength(e.pts), d = ((ms / 1400 + i * 0.17) % 1) * L;
      let run = 0;
      for (let j = 1; j < e.pts.length; j++) {
        const [x0, y0] = e.pts[j - 1], [x1, y1] = e.pts[j], l = Math.hypot(x1 - x0, y1 - y0);
        if (run + l >= d) { const u = (d - run) / (l || 1); ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 4.5, 0, 7); ctx.fill(); break; }
        run += l;
      }
    }
    if (e.label && p === 1 && (on || s.beat === 0)) {
      ctx.globalAlpha = (on ? 1 : dim) * seg(build, 0.8, 0.95);
      rr(ctx, e.label.x, e.label.y, e.label.w, e.label.h, 11); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.node2; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = "12px 'Inter Tight'"; ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.fillText(a.label, e.label.x + e.label.w / 2, e.label.y + 15); ctx.textAlign = 'left';
    }
  });
  const nodes = [...arch.nodes, ...arch.services, ...(arch.actor ? [arch.actor] : [])];
  nodes.forEach((n, i) => {
    const b = lay.boxes.get(n.id); if (!b) return;
    const appear = seg(build, 0.15 + (i / nodes.length) * 0.3, 0.3 + (i / nodes.length) * 0.3); if (!appear) return;
    ctx.globalAlpha = appear * alphaFor(n.id);
    const col = color.get(n.id) ?? C.muted, svc = n.id.startsWith?.('svc:');
    const lift = (1 - appear) * 14;
    if (n.kind === 'actor') {
      ctx.fillStyle = C.node; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2 + lift, b.w / 2, 0, 7); ctx.fill(); ctx.stroke();
      ctx.font = "700 14px 'Inter Tight'"; ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.fillText(n.title, b.x + b.w / 2, b.y + b.h / 2 + 5 + lift); ctx.textAlign = 'left';
      return;
    }
    const sh = shapeOf(n.kind, b.x, b.y + lift, b.w, b.h), body = new Path2D(sh.body);
    ctx.save(); ctx.shadowColor = 'rgba(21,19,15,0.10)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4; ctx.fillStyle = svc ? C.node2 : C.node; ctx.fill(body); ctx.restore();
    ctx.strokeStyle = svc ? C.ink : col; ctx.lineWidth = n.heart ? 3 : 1.8; ctx.setLineDash(svc && n.kind !== 'cloud' ? [6, 5] : []); ctx.stroke(body); ctx.setLineDash([]);
    if (sh.lines) { ctx.lineCap = 'round'; ctx.stroke(new Path2D(sh.lines)); ctx.lineCap = 'butt'; }
    const ty = b.y + textTop(n.kind) + lift;
    ctx.fillStyle = svc ? C.ink : col; ctx.fillRect(b.x + 16, ty - 13, 4, 20);
    ctx.font = "600 15px 'Inter Tight'"; ctx.fillStyle = C.ink; ctx.fillText(n.title, b.x + 28, ty);
    ctx.font = "12px 'Inter Tight'"; ctx.fillStyle = C.muted; ctx.fillText(svc ? n.pkgs.slice(0, 2).join(', ') : n.file.split('/').pop(), b.x + 28, ty + 19);
    if (n.heart) { rr(ctx, b.x + b.w - 58, b.y - 11 + lift, 50, 20, 10); ctx.fillStyle = col; ctx.fill(); ctx.font = "800 10.5px 'Inter Tight'"; ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.fillText('CORE', b.x + b.w - 33, b.y + 3 + lift); ctx.textAlign = 'left'; }
  });
  ctx.restore();
  ctx.globalAlpha = 1;
  // The beat's name, large, in the corner it does not cover.
  if (s.beat > 0) {
    const a = seg(el / 1000, 0.6, 1.2);
    ctx.globalAlpha = a;
    ctx.font = "italic 400 64px 'Instrument Serif'";
    ctx.fillStyle = C.ink; ctx.fillText(s.heading, 72, 150);
    ctx.globalAlpha = 1;
  }
}
