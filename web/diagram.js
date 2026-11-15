// The architecture as one designed picture: areas laid out left to right by dependency (callers
// first, foundations last), weighted arrows for the imports between them, the busiest files inside
// each area, where things start and where the heart is, and the stack along the bottom.
// Returns a standalone SVG string, so the same picture shows on the page and downloads as a file.

const C = { bg: '#0d060b', surface: '#1b0e17', s2: '#26141f', plum: '#470c35', ink: '#ffffff', muted: '#b3a8b0', faint: '#4a3442', accent: '#ff488b' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const base = f => f.split('/').pop();
const DISPLAY = `font-family="Archivo, 'Arial Narrow', sans-serif" font-weight="800" font-stretch="62%" style="font-stretch:62%"`;
const TEXT = `font-family="Archivo, Arial, sans-serif"`;

export function diagramSVG(model, { maxAreas = 14 } = {}) {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const heart = model.core[0]?.file, entries = new Set(model.entries.map(m => m.file));
  let areas = model.areas.map(a => ({ ...a, code: a.files.filter(f => !byFile.get(f).test) })).filter(a => a.code.length);
  const hidden = areas.length > maxAreas ? areas.length - maxAreas : 0;
  areas = [...areas].sort((a, b) => b.code.length - a.code.length).slice(0, maxAreas).sort((a, b) => a.rank - b.rank || b.code.length - a.code.length);
  const names = new Set(areas.map(a => a.name));

  // Columns by rank, compacted so empty ranks leave no gap.
  const ranks = [...new Set(areas.map(a => a.rank))].sort((a, b) => a - b);
  const cols = ranks.map(r => areas.filter(a => a.rank === r));
  const BW = 270, GX = 120, GY = 52, PAD = 64, TOP = 190, ROW = 30;
  const boxH = a => 112 + Math.min(5, a.code.length) * ROW;
  const colH = col => col.reduce((s, a) => s + boxH(a) + GY, -GY);
  const H0 = Math.max(...cols.map(colH));
  const pos = new Map();
  cols.forEach((col, ci) => {
    let y = TOP + (H0 - colH(col)) / 2;
    for (const a of col) { pos.set(a.name, { x: PAD + ci * (BW + GX), y, w: BW, h: boxH(a) }); y += boxH(a) + GY; }
  });
  const stack = model.stack.slice(0, 10);
  const W = Math.max(PAD * 2 + cols.length * (BW + GX) - GX, 900);
  const H = TOP + H0 + (stack.length ? 170 : 90);

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Architecture of ${model.meta.full}`)}">`);
  out.push(`<defs>
    <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.accent}"/></marker>
    <marker id="ahm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${C.faint}"/></marker>
  </defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
  out.push(`<text x="${PAD}" y="92" ${DISPLAY} font-size="72" fill="${C.ink}">${esc(model.meta.name.toUpperCase())}</text>`);
  out.push(`<text x="${PAD}" y="128" ${TEXT} font-size="17" fill="${C.muted}">${esc(`${model.meta.full} @ ${model.meta.sha.slice(0, 7)} · ${areas.length} areas · ${model.totals.code} source files · ${model.edges.length} imports${hidden ? ` · ${hidden} smaller areas not shown` : ''}`)}</text>`);
  out.push(`<text x="${W - PAD}" y="128" ${TEXT} font-size="15" fill="${C.muted}" text-anchor="end">callers → foundations</text>`);

  // Arrows first, so boxes sit on top of them.
  const links = [];
  for (const a of areas) for (const o of a.out) if (names.has(o.to)) links.push({ from: a.name, to: o.to, w: o.weight });
  const maxW = Math.max(1, ...links.map(l => l.w));
  const portsOut = new Map(), portsIn = new Map();
  const port = (map, key, total, i) => { const p = pos.get(key); return p.y + (p.h * (i + 1)) / (total + 1); };
  const fwd = links.filter(l => pos.get(l.to).x > pos.get(l.from).x);
  for (const l of fwd) { (portsOut.get(l.from) ?? portsOut.set(l.from, []).get(l.from)).push(l); (portsIn.get(l.to) ?? portsIn.set(l.to, []).get(l.to)).push(l); }
  for (const list of [...portsOut.values(), ...portsIn.values()]) list.sort((a, b) => pos.get(a.to).y + pos.get(a.from).y - pos.get(b.to).y - pos.get(b.from).y);
  for (const l of links) {
    const A = pos.get(l.from), B = pos.get(l.to), sw = (2 + (l.w / maxW) * 7).toFixed(1);
    if (B.x > A.x) {
      const so = portsOut.get(l.from), si = portsIn.get(l.to);
      const y1 = port(portsOut, l.from, so.length, so.indexOf(l)), y2 = port(portsIn, l.to, si.length, si.indexOf(l));
      const x1 = A.x + A.w, x2 = B.x - 6, mx = (x1 + x2) / 2;
      out.push(`<path d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="${C.accent}" stroke-width="${sw}" stroke-opacity="${(0.45 + 0.55 * l.w / maxW).toFixed(2)}" marker-end="url(#ah)"/>`);
      const lx = mx, ly = (y1 + y2) / 2;
      out.push(`<rect x="${lx - 17}" y="${ly - 12}" width="34" height="24" fill="${C.bg}"/><text x="${lx}" y="${ly + 5}" ${TEXT} font-size="13" font-weight="600" fill="${C.ink}" text-anchor="middle">${l.w}</text>`);
    } else {
      // Against the flow: a muted dashed arc under the boxes.
      const x1 = A.x + A.w / 2, x2 = B.x + B.w / 2, y1 = A.y + A.h, y2 = B.y + B.h, dip = Math.max(y1, y2) + 40 + Math.abs(x1 - x2) * 0.08;
      out.push(`<path d="M${x1} ${y1}C${x1} ${dip} ${x2} ${dip} ${x2} ${y2 + 6}" fill="none" stroke="${C.faint}" stroke-width="2" stroke-dasharray="6 6" marker-end="url(#ahm)"/>`);
    }
  }

  for (const a of areas) {
    const p = pos.get(a.name), hasHeart = a.code.includes(heart), starts = a.code.some(f => entries.has(f));
    const lines = a.code.reduce((s, f) => s + byFile.get(f).lines, 0);
    out.push(`<g>`);
    out.push(`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${hasHeart ? C.plum : C.surface}"/>`);
    out.push(`<rect x="${p.x}" y="${p.y}" width="6" height="${p.h}" fill="${hasHeart ? C.accent : starts ? C.ink : C.s2}"/>`);
    const title = base(a.name).toUpperCase();
    out.push(`<text x="${p.x + 22}" y="${p.y + 44}" ${DISPLAY} font-size="${title.length > 14 ? 26 : 34}" fill="${C.ink}">${esc(title.slice(0, 20))}</text>`);
    const where = a.name !== base(a.name) ? (a.name.length > 30 ? '…' + a.name.slice(-29) : a.name) + ' · ' : '';
    out.push(`<text x="${p.x + 22}" y="${p.y + 70}" ${TEXT} font-size="13" fill="${C.muted}">${esc(`${where}${a.code.length} files · ${lines.toLocaleString('en')} lines`)}</text>`);
    if (hasHeart || starts) {
      // A tab on the box's top edge, clear of the title.
      const tag = hasHeart ? 'HEART' : 'STARTS HERE', tw = tag.length * 8.4 + 18;
      out.push(`<rect x="${p.x + p.w - tw}" y="${p.y - 22}" width="${tw}" height="22" fill="${hasHeart ? C.accent : C.ink}"/><text x="${p.x + p.w - tw / 2}" y="${p.y - 6.5}" ${TEXT} font-size="11" font-weight="700" fill="${C.bg}" text-anchor="middle" letter-spacing=".06em">${tag}</text>`);
    }
    const top = [...a.code].sort((x, y) => byFile.get(y).importedBy.length - byFile.get(x).importedBy.length || byFile.get(y).lines - byFile.get(x).lines).slice(0, 5);
    const most = Math.max(1, ...top.map(f => byFile.get(f).importedBy.length));
    top.forEach((f, i) => {
      const y = p.y + 92 + i * ROW, n = byFile.get(f).importedBy.length;
      out.push(`<rect x="${p.x + 22}" y="${y}" width="${((p.w - 44) * Math.max(0.04, n / most)).toFixed(1)}" height="24" fill="${f === heart ? C.accent : C.s2}" fill-opacity="${f === heart ? 0.35 : 1}"/>`);
      out.push(`<text x="${p.x + 30}" y="${y + 16.5}" ${TEXT} font-size="13" fill="${C.ink}">${esc(base(f).length > 26 ? base(f).slice(0, 25) + '…' : base(f))}</text>`);
      if (n) out.push(`<text x="${p.x + p.w - 30}" y="${y + 16.5}" ${TEXT} font-size="12" fill="${C.muted}" text-anchor="end">${n}</text>`);
    });
    if (a.code.length > 5) out.push(`<text x="${p.x + 22}" y="${p.y + p.h - 10}" ${TEXT} font-size="12" fill="${C.muted}">+ ${a.code.length - 5} more</text>`);
    out.push(`</g>`);
  }

  if (stack.length) {
    const y = H - 120;
    out.push(`<text x="${PAD}" y="${y}" ${DISPLAY} font-size="26" fill="${C.ink}">BUILT WITH</text>`);
    let x = PAD;
    for (const s of stack) {
      const w = s.name.length * 9.4 + 28;
      if (x + w > W - PAD) break;
      out.push(`<rect x="${x}" y="${y + 18}" width="${w}" height="36" fill="${C.surface}"/><text x="${x + 14}" y="${y + 41}" ${TEXT} font-size="15" font-weight="600" fill="${C.ink}">${esc(s.name)}</text>`);
      x += w + 8;
    }
  }
  out.push(`<text x="${W - PAD}" y="${H - 24}" ${TEXT} font-size="13" fill="${C.muted}" text-anchor="end">Numbers on arrows: imports between areas · bars: how many files import each file · drawn by RepoTale</text>`);
  out.push('</svg>');
  return out.join('\n');
}
