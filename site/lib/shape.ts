// From RepoTale's engine model to what a page shows: at most nine files (the reading route, then the most
// connected), laid out in import order, and every import between them with the code it cites. Pure, so the
// committed demo (scripts/fixture.ts) and live pages (lib/engine.ts) are built the same way.
import type { Fixture } from './fixture';

export interface EngineModule { file: string; lines: number; test: boolean; imports: string[]; importedBy: string[]; symbols: { name: string; line: number; exported: boolean }[] }
export interface EngineEdge { from: string; to: string; line: number; names?: string[] }
export interface Reading { files: { file: string; why: string; minutes: number }[]; heart?: string; route?: string[] | null }

const MAX = 9; // legible on a phone

/** The last line of the import statement that starts at `line` (1-based). JavaScript: up to the line naming the
 *  module (`} from './x'`). Python: a parenthesised name list runs to its `)`. Anything else, or a statement
 *  whose end cannot be found within 40 lines, is cited as the one line, never as a guessed range. */
export function statementEnd(lines: string[], line: number, file: string): number {
  const at = (n: number) => lines[n - 1] ?? '';
  const done = /\.py$/.test(file)
    ? (/\(/.test(at(line)) && !/\)/.test(at(line)) ? (s: string) => /\)/.test(s) : null)
    : /\.go$/.test(file) ? null : (s: string) => /\bfrom\s*['"]|\brequire\s*\(|\bimport\s*\(|^\s*import\s+['"]/.test(s);
  if (!done) return line;
  for (let n = line; n <= Math.min(lines.length, line + 40); n++) if (done(at(n))) return n;
  return line;
}

/** Each file's layer: the longest import path to it, with the entry fixed at 0. A depth-first walk (the entry
 *  first, then the rest by name) drops each import that leads back to a file still on the walk, which leaves
 *  a cycle-free graph, the same one for the same input every time. */
export function layers(files: string[], edges: { from: string; to: string }[], entry: string): Map<string, number> {
  const next = new Map(files.map(f => [f, [] as string[]]));
  for (const e of [...edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)))
    if (e.to !== entry && e.from !== e.to && next.has(e.to)) next.get(e.from)?.push(e.to);
  const state = new Map<string, 'open' | 'done'>(), dag = new Map(files.map(f => [f, [] as string[]])), post: string[] = [];
  const walk = (f: string) => {
    state.set(f, 'open');
    for (const t of next.get(f)!) {
      if (state.get(t) === 'open') continue; // closes a cycle
      dag.get(f)!.push(t);
      if (!state.has(t)) walk(t);
    }
    state.set(f, 'done');
    post.push(f);
  };
  for (const f of [entry, ...[...files].sort()]) if (next.has(f) && !state.has(f)) walk(f);
  const layer = new Map(files.map(f => [f, 0]));
  for (const f of post.reverse()) for (const t of dag.get(f)!) layer.set(t, Math.max(layer.get(t)!, layer.get(f)! + 1));
  return layer;
}

export function shape(
  model: { modules: EngineModule[]; edges: EngineEdge[] },
  reading: Reading,
  source: (file: string) => string[],
  about: Pick<Fixture, 'repo' | 'sha' | 'url' | 'builtAt'> & Partial<Pick<Fixture, 'meta'>>,
): Fixture {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const code = model.modules.filter(m => !m.test);
  const score = (m: EngineModule) => m.importedBy.filter(f => !byFile.get(f)?.test).length * 2 + m.imports.length;
  // Ties break by name: the engine reads files concurrently, so its module order differs between reads.
  const picked = [...new Set<string>([...(reading.route ?? []), ...[...code].sort((a, b) => score(b) - score(a) || a.file.localeCompare(b.file)).map(m => m.file)])].slice(0, MAX);
  const inGraph = new Set(picked);
  const entry = reading.route?.[0] ?? picked[0] ?? '';
  const layer = layers(picked, model.edges.filter(e => inGraph.has(e.from) && inGraph.has(e.to)), entry);
  // The map draws imports that run forward; one that closes a cycle is left out of it (and of its counts).
  const edges = model.edges.filter(e => inGraph.has(e.from) && inGraph.has(e.to) && layer.get(e.to)! > layer.get(e.from)!);

  // Columns left to right; within one, files sit near the files that import them, so fewer lines cross.
  const cols = [...new Set(layer.values())].sort((a, b) => a - b);
  const pos = new Map<string, number>();
  const placed = cols.flatMap((l, c) => {
    const mates = picked.filter(f => layer.get(f) === l).map((f, i) => {
      const from = edges.filter(e => e.to === f && pos.has(e.from)).map(e => pos.get(e.from)!);
      return { f, at: from.length ? from.reduce((s, x) => s + x, 0) / from.length : i };
    }).sort((a, b) => a.at - b.at || a.f.localeCompare(b.f));
    mates.forEach(({ f }, row) => pos.set(f, (row + 0.5) / mates.length));
    return mates.map(({ f }, row) => ({ f, col: c, row, rows: mates.length }));
  });
  // A file is named by its base name; two with the same one (app.py, sansio/app.py) add their folder.
  const base = (f: string) => f.split('/').pop()!.replace(/\.[a-z]+$/, '');
  const label = (f: string) => (picked.filter(g => base(g) === base(f)).length > 1 ? `${f.split('/').at(-2) ?? ''}/${base(f)}` : base(f));
  const nodes = placed.map(({ f, col, row, rows }) => {
    const m = byFile.get(f)!;
    return {
      id: f, label: label(f), col, row, rows,
      lines: m.lines, users: m.importedBy.filter(g => !byFile.get(g)?.test).length, entry: f === entry, heart: f === reading.heart,
    };
  });

  // Each import's evidence: the whole statement (it can span lines) and two lines either side, as committed.
  // Verified means the statement itself names the imported file: checked here, not assumed.
  const cited = edges.map(e => {
    const all = source(e.from);
    const end = statementEnd(all, e.line, e.from);
    const parts = e.to.split('/');
    const stem = parts.at(-1)!.replace(/\.[a-z]+$/, '').replace(/^(index|__init__)$/, parts.at(-2) ?? 'index');
    const start = Math.max(1, e.line - 2);
    return {
      from: e.from, to: e.to, line: e.line, end, names: (e.names ?? []).slice(0, 4), start,
      code: all.slice(start - 1, Math.min(all.length, end + 2)), verified: all.slice(e.line - 1, end).join('\n').includes(stem),
    };
  });

  return {
    ...about,
    stats: {
      modules: code.length, tests: model.modules.length - code.length,
      imports: model.edges.filter(e => !byFile.get(e.from)?.test && !byFile.get(e.to)?.test).length,
    },
    entry, heart: reading.heart ?? '',
    nodes, edges: cited,
    startHere: reading.files.map(f => ({ file: f.file, why: f.why, minutes: f.minutes, line: byFile.get(f.file)?.symbols.find(s => s.exported)?.line ?? 1 })),
  };
}
