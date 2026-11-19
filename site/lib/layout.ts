// Diagram geometry, in SVG units, for both orientations. Imports flow along the main axis (left to right on
// wide screens, top to bottom on phones); a column's files stack across it. An import that skips columns
// runs in a lane that no box sits in, so a line never passes behind a file it does not touch.
import type { FixtureEdge, FixtureNode } from './fixture';

export type Orientation = 'h' | 'v';
export interface Box { id: string; x: number; y: number; w: number; h: number }
export interface Wire { id: string; from: string; to: string; d: string; verified: boolean }
export interface Layout { w: number; h: number; boxes: Box[]; wires: Wire[] }

const r = (n: number) => Math.round(n * 10) / 10;

export function layout(nodes: FixtureNode[], edges: Pick<FixtureEdge, 'from' | 'to' | 'verified'>[], o: Orientation): Layout {
  const cols = Math.max(...nodes.map(n => n.col)) + 1;
  const most = Math.max(...nodes.map(n => n.rows));
  const pad = o === 'h' ? 24 : 8;
  // Phones: up to three files across fill 340 units; more widen the drawing (it scales down) rather than
  // squeezing boxes below a readable 92. Wide screens: boxes narrow when there are more than five columns,
  // keeping a 40-unit gap for the lines.
  const width = o === 'h' ? 1100 : Math.max(340, 2 * pad + most * 92 + (most - 1) * 12);
  const crossSize = o === 'h' ? 44 : (width - 2 * pad - (most - 1) * 12) / most;
  const crossStep = o === 'h' ? 72 : crossSize + 12;
  const mainSize = o === 'h' ? Math.min(172, (width - 2 * pad - 40 * (cols - 1)) / cols) : 40;
  const mainStep = o === 'h' ? (width - 2 * pad - mainSize) / Math.max(1, cols - 1) : 76;
  const mainEnd = 2 * pad + (cols - 1) * mainStep + mainSize;
  const crossEnd = 2 * pad + (most - 1) * crossStep + crossSize;
  const gap = mainStep - mainSize;
  const half = (crossStep - crossSize) / 2;

  const at = new Map(nodes.map(n => [n.id, { col: n.col, m: pad + n.col * mainStep, c: pad + ((most - n.rows) * crossStep) / 2 + n.row * crossStep }]));
  const pt = (m: number, c: number) => (o === 'h' ? `${r(m)} ${r(c)}` : `${r(c)} ${r(m)}`);
  const lanes = [pad / 2, crossEnd - pad / 2, ...[...at.values()].flatMap(p => [p.c - half, p.c + crossSize + half])];
  const free = (lane: number, c1: number, c2: number) =>
    [...at.values()].every(p => p.col <= c1 || p.col >= c2 || lane < p.c - 2 || lane > p.c + crossSize + 2);

  const boxes = nodes.map(n => {
    const p = at.get(n.id)!;
    return o === 'h' ? { id: n.id, x: r(p.m), y: r(p.c), w: r(mainSize), h: r(crossSize) } : { id: n.id, x: r(p.c), y: r(p.m), w: r(crossSize), h: mainSize };
  });

  const wires = edges.flatMap(e => {
    const s = at.get(e.from), t = at.get(e.to);
    if (!s || !t || t.col <= s.col) return [];
    const sm = s.m + mainSize, sc = s.c + crossSize / 2, tm = t.m, tc = t.c + crossSize / 2;
    let d: string;
    if (t.col - s.col === 1) {
      const mid = (sm + tm) / 2;
      d = `M${pt(sm, sc)} C${pt(mid, sc)} ${pt(mid, tc)} ${pt(tm, tc)}`;
    } else {
      const want = (sc + tc) / 2;
      const lane = lanes.filter(l => free(l, s.col, t.col)).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0] ?? pad / 2;
      d = `M${pt(sm, sc)} C${pt(sm + gap / 2, sc)} ${pt(sm + gap / 2, lane)} ${pt(sm + gap, lane)} L${pt(tm - gap, lane)} C${pt(tm - gap / 2, lane)} ${pt(tm - gap / 2, tc)} ${pt(tm, tc)}`;
    }
    return [{ id: `${e.from}>${e.to}`, from: e.from, to: e.to, d, verified: e.verified }];
  });

  return o === 'h' ? { w: width, h: r(crossEnd), boxes, wires } : { w: width, h: r(mainEnd), boxes, wires };
}
