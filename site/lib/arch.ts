// The architecture, at two levels like a street map: the overview (each subsystem one box, the imports between
// two subsystems one arrow) and each subsystem opened (its own files, its neighbours folded into one box each).
// The parts and arrows come from web/arch.js, the same builder the static site and the film use; here they are
// placed with lib/shape.ts `place`, so they draw with the same layout as the import map. Every arrow keeps the
// line that proves it.
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { buildArch, focusArch, mermaidArch, overviewArch } from '../../web/arch.js';
import { roleOf, speaksForFile } from './explain.ts';
import { place } from './shape.ts';

export interface Cite { file: string; line?: number }
export interface ArchNode {
  id: string; title: string; sub: string; col: number; row: number; rows: number;
  kind: string; role: 'part' | 'file' | 'neighbour' | 'service' | 'actor';
  heart: boolean; entry: boolean; area?: string; file?: string; usedBy?: number;
  /** What it does, in its authors' words: a doc comment, with where it was read. */
  about?: { text: string; file: string; line: number };
  /** What the code itself shows it holds, in plain words: type definitions, classes, functions, and their names. */
  holds?: string;
  /** Which parts use it and which it uses, from the imports between them. */
  links?: string;
}
export interface ArchEdge { from: string; to: string; count: number; label: string; external: boolean; both: boolean; drawn: boolean; cite: Cite | null }
export interface ArchView { level: 'overview' | 'focus'; area: string | null; title: string; files: number; hidden: number; nodes: ArchNode[]; edges: ArchEdge[]; mermaid: string }
export interface ArchData { overview: ArchView | null; parts: ArchView[] }

interface RawNode { id: string; title: string; sub?: string; kind: string; area?: string; file?: string; lines?: number; users?: number; entry?: boolean; heart?: boolean; neighbour?: boolean; usedBy?: number }
interface RawEdge { from: string; to: string; count: number; label?: string; detail?: string; external?: boolean; both?: boolean; at?: string; line?: number }
interface Raw { level: 'overview' | 'focus'; area?: string; groups: { area: string; label: string; files: number }[]; nodes: RawNode[]; services: { id: string; title: string; kind: string; pkgs: string[] }[]; actor: { id: string; title: string } | null; edges: RawEdge[]; hidden: number }

const plural = (n: number, w: string, many = `${w}s`) => `${n.toLocaleString('en')} ${n === 1 ? w : many}`;
const list = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

interface Sym { name: string; kind?: string; exported: boolean }
/** What a set of files holds, from their declarations alone: only type definitions (which describe data and run
 *  nothing), or classes, functions and constants, each with a few of their names. */
export function holdsOf(symbols: Sym[]): string | undefined {
  const pub = symbols.filter(s => s.exported && !s.name.startsWith('_'));
  if (!pub.length) return undefined;
  const of = (k: string) => pub.filter(s => (s.kind ?? 'function') === k);
  const names = (a: Sym[]) => list(a.slice(0, 3).map(s => s.name));
  const types = of('type'), classes = of('class'), fns = of('function'), consts = of('const');
  if (types.length === pub.length) return `Only type definitions, such as ${names(types)}: they describe the shape of its data, and no code runs here.`;
  const parts = [
    classes.length ? `${plural(classes.length, 'class', 'classes')} (${names(classes)})` : '',
    fns.length ? `${plural(fns.length, 'function')} (${names(fns)})` : '',
    consts.length ? `${plural(consts.length, 'constant')} (${names(consts)})` : '',
    types.length ? plural(types.length, 'type definition') : '',
  ].filter(Boolean);
  return `It defines ${list(parts)}.`;
}

function view(raw: Raw, title: string, files: number, about: (n: RawNode) => ArchNode['about'], holds: (n: RawNode) => string | undefined): ArchView {
  const all: Omit<ArchNode, 'col' | 'row' | 'rows'>[] = [
    ...(raw.actor ? [{ id: raw.actor.id, title: raw.actor.title, sub: 'starts it', kind: 'actor', role: 'actor' as const, heart: false, entry: false }] : []),
    ...raw.nodes.map(n => ({
      id: n.id, title: n.title, kind: n.kind, heart: !!n.heart, entry: !!n.entry, area: n.area, file: n.file, usedBy: n.usedBy,
      role: (n.file ? 'file' : n.neighbour ? 'neighbour' : 'part') as ArchNode['role'],
      sub: n.sub ?? (n.file ? `${plural(n.lines ?? 0, 'line')}${n.users ? ` · ${plural(n.users, 'user')}` : ''}` : ''),
      about: about(n), holds: holds(n),
    })),
    ...raw.services.map(s => ({ id: s.id, title: s.title, sub: s.pkgs.slice(0, 2).join(', '), kind: s.kind, role: 'service' as const, heart: false, entry: false })),
  ];
  const ids = all.map(n => n.id);
  const known = new Set(ids);
  const edges = raw.edges.filter(e => known.has(e.from) && known.has(e.to));
  const entry = raw.actor?.id ?? all.find(n => n.entry)?.id ?? ids[0] ?? '';
  const { placed, forward } = place(ids, edges, entry);
  const at = new Map(placed.map(p => [p.id, p]));
  // Who uses a box and what it uses, said with the names on the other boxes.
  const name = new Map(all.map(n => [n.id, n.title]));
  const links = (id: string) => {
    const by = edges.filter(e => e.to === id && !e.external && e.from !== 'actor').map(e => name.get(e.from)!);
    const uses = edges.filter(e => e.from === id && !e.external).map(e => name.get(e.to)!);
    const out = [by.length ? `Used by ${list(by.slice(0, 4))}${by.length > 4 ? ' and more' : ''}.` : '', uses.length ? `It uses ${list(uses.slice(0, 4))}${uses.length > 4 ? ' and more' : ''}.` : ''];
    return out.filter(Boolean).join(' ') || undefined;
  };
  return {
    level: raw.level, area: raw.area ?? null, title, files, hidden: raw.hidden,
    nodes: all.map(n => ({ ...n, ...at.get(n.id)!, ...(n.role === 'part' || n.role === 'file' ? { links: links(n.id) } : {}) })),
    edges: edges.map(e => ({
      from: e.from, to: e.to, count: e.count, label: e.detail || e.label || '', external: !!e.external, both: !!e.both,
      drawn: forward.includes(e), cite: e.at ? { file: e.at, ...(e.line ? { line: e.line } : {}) } : null,
    })),
    mermaid: mermaidArch(raw),
  };
}

interface Mod { file: string; area: string; test: boolean; text: string; importedBy: string[]; symbols: Sym[] }

/** The overview and every subsystem opened. A flat package has no overview: it is one part, shown opened.
 *  A file says what it does through its doc comment; a part, through its best documented, most used file. */
export function archOf(model: { modules: Mod[]; meta?: { name?: string } }): ArchData {
  const project = model.meta?.name ?? '';
  const code = model.modules.filter(m => !m.test), byFile = new Map(code.map(m => [m.file, m]));
  const cache = new Map<string, ArchNode['about']>();
  // Only a comment about the whole module, or a class named like the file, describes a file: a function's
  // comment describes that function.
  const ofFile = (f: string) => {
    if (!cache.has(f)) {
      const m = byFile.get(f), r = m ? roleOf(m.text, f) : null;
      cache.set(f, speaksForFile(r, f, project) ? { text: r.text.split(/(?<=[.!?])\s+(?=[A-Z])/)[0]!, file: f, line: r.line } : undefined);
    }
    return cache.get(f);
  };
  // A part speaks through its most used files that describe themselves.
  const ofArea = (area: string) => code.filter(m => m.area === area).sort((a, b) => b.importedBy.length - a.importedBy.length).slice(0, 4)
    .find(m => ofFile(m.file))?.file;
  const about = (n: RawNode) => { const f = n.file ?? (n.area ? ofArea(n.area) : undefined); return f ? ofFile(f) : undefined; };
  const holds = (n: RawNode) => n.file ? holdsOf(byFile.get(n.file)?.symbols ?? []) : n.area && !n.neighbour ? holdsOf(code.filter(m => m.area === n.area).flatMap(m => m.symbols)) : undefined;
  const arch = buildArch(model) as Raw & { groups: { area: string; label: string; files: number }[] };
  const ov = overviewArch(model, arch) as Raw;
  const parts = arch.groups.map(g => view(focusArch(model, arch, g.area) as Raw, g.label, g.files, about, holds));
  return { overview: ov.nodes.length > 1 ? view(ov, 'Overview', arch.groups.reduce((s, g) => s + g.files, 0), about, holds) : null, parts };
}
