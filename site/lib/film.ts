// The film's script: a repository explained to someone who has never seen it, in about a minute. It answers
// what a newcomer asks, in order: what is this, what does it give me, how do I use it, what are its parts, what
// happens when I use it, where do I start reading, and what should I be careful with. The words come from the
// authors (the README, the doc comments) and from the code (what imports what); every sentence cites its line.
// Each sentence is a beat that names what the picture shows while it is said (`focus`), so picture and words
// change together, and the rest of the frame steps back.
// Pure: the engine's model in, plain data out; nothing here fetches or draws.
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { blastRadius } from '../../web/analyze.js';
import { holdsOf, type ArchData } from './arch.ts';
import { plain, readReadme, roleOf, speaksForFile } from './explain.ts';

export interface Cite { file: string; line?: number; end?: number }
export interface Beat { say: string; focus: string[]; cite?: Cite }
export interface MapNode { id: string; label: string; sub: string; col: number; row: number; rows: number; heart: boolean; entry: boolean }
export type Scene = { title: string; beats: Beat[] } & (
  | { kind: 'title'; name: string; hook: string }
  | { kind: 'features'; items: { id: string; text: string }[] }
  | { kind: 'usage'; install: string | null; lang: string; from: number; lines: string[] }
  | { kind: 'map'; nodes: MapNode[]; edges: { id: string; from: string; to: string }[]; roles: { id: string; text: string; quote: boolean }[] }
  | { kind: 'flow'; steps: { id: string; file: string; text: string }[] }
  | { kind: 'start'; items: { id: string; file: string; minutes: number }[] }
  | { kind: 'reach'; center: string; bands: { id: string; label: string; files: string[] }[]; tests: number; read: number }
  | { kind: 'end'; name: string; url: string }
);
export interface Film { repo: string; sha: string; scenes: Scene[] }

interface Mod { file: string; lines: number; test: boolean; area: string; text: string; imports: string[]; importedBy: string[]; symbols: { name: string; line: number; exported: boolean; kind?: string }[] }
interface Model {
  modules: Mod[]; edges: { from: string; to: string; line: number; names?: string[] }[]; entries: Mod[]; core: Mod[];
  totals: { code: number; tests: number; lines: number; languages: [string, number][] }; testsReaching: (f: string) => string[];
}
interface Reading { heart?: string; route?: string[] | null; files: { file: string; minutes: number }[] }
interface About { repo: string; sha: string; url: string; description: string; readme?: string | null; readmePath?: string | null }

const plural = (n: number, w: string, many = `${w}s`) => `${n.toLocaleString('en')} ${n === 1 ? w : many}`;
const list = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const base = (f: string) => f.split('/').pop() ?? f;
/** A file as it is said aloud and in the transcript: "Ky.ts", or "core/Ky.ts" when two share the name. */
const namer = (files: string[]) => (f: string) => (files.filter(g => base(g) === base(f)).length > 1 ? f.split('/').slice(-2).join('/') : base(f));
const stop = (s: string) => s.replace(/[\s.!:;,]+$/, '') + '.';
/** The first sentence only: a listener holds one at a time. */
const first = (s: string) => stop(s.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? s);
/** A feature as a listener hears it: "Method shortcuts (ky.post())" is "method shortcuts". */
const spoken = (s: string) => { let t = s; while (/\([^()]*\)/.test(t)) t = t.replace(/\s*\([^()]*\)/g, ''); return t; };
const said = (s: string) => spoken(s).replace(/[.;:]+$/, '').trim().replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase());

export function buildFilm(model: Model, reading: Reading, arch: ArchData, about: About): Film {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const code = model.modules.filter(m => !m.test);
  const say = namer(code.map(m => m.file));
  const name = about.repo.split('/')[1] ?? about.repo;
  const readme = readReadme(about.readme), rp = about.readmePath ?? 'README.md';
  const users = (f: string) => (byFile.get(f)?.importedBy ?? []).filter(g => !byFile.get(g)?.test);
  const role = (f: string) => { const m = byFile.get(f); return m ? roleOf(m.text, f) : null; };
  /** What a file is, in a clause: its authors' words, else the names it defines. */
  const what = (f: string) => {
    const r = role(f);
    if (speaksForFile(r, f, name)) return { text: first(r.text), cite: { file: f, line: r.line } as Cite };
    // Else only what it plainly defines: public names, classes and functions before types.
    const pub = (byFile.get(f)?.symbols ?? []).filter(s => s.exported && !s.name.startsWith('_'));
    const pick = [...pub.filter(s => s.kind !== 'type'), ...pub.filter(s => s.kind === 'type')].slice(0, 2);
    return pick.length ? { text: `It defines ${list(pick.map(s => s.name))}.`, cite: { file: f, line: pick[0]!.line } as Cite } : null;
  };
  const S: Scene[] = [];

  // 1. What it is, in the authors' words: the README's opening sentence, else the GitHub description.
  const hook = readme.intro?.text ?? (about.description ? stop(plain(about.description)) : '');
  S.push({
    kind: 'title', title: 'What it is', name, hook,
    beats: [
      { say: `This is ${name}.`, focus: ['name'] },
      ...(hook ? [{ say: stop(hook), focus: ['hook'], ...(readme.intro ? { cite: { file: rp, line: readme.intro.line } } : {}) }] : []),
    ],
  });

  // 2. What it gives you: the README's own feature list.
  if (readme.features.length >= 2) {
    const items = readme.features.slice(0, 4).map((f, i) => ({ id: `f${i}`, text: f.text }));
    S.push({
      kind: 'features', title: 'What it gives you', items,
      beats: [{ say: `Its README lists what it gives you: ${list(items.map(i => said(i.text)))}.`, focus: items.map(i => i.id), cite: { file: rp, line: readme.features[0]!.line, end: readme.features[items.length - 1]!.line } }],
    });
  }

  // 3. How you use it: the install command and the first example, both from the README.
  if (readme.install || readme.example) {
    const ex = readme.example;
    S.push({
      kind: 'usage', title: 'How you use it', install: readme.install?.text ?? null, lang: ex?.lang ?? '', from: ex?.line ?? 0, lines: ex?.code.slice(0, 14) ?? [],
      beats: [
        ...(readme.install ? [{ say: `You add it to a project with ${readme.install.text}.`, focus: ['install'], cite: { file: rp, line: readme.install.line } }] : []),
        ...(ex ? [{ say: 'And this is the first example its README gives.', focus: ['example'], cite: { file: rp, line: ex.line, end: ex.line + Math.min(14, ex.code.length) - 1 } }] : []),
      ],
    });
  }

  // 4. Its parts, and what the main ones do, from the doc comment of each part's best documented file.
  const ov = arch.overview;
  if (ov) {
    const parts = ov.nodes.filter(n => n.role === 'part');
    // A part is described only by what its most used file says about itself as a whole (a module or class doc
    // comment): a function's comment describes that function, not the part.
    // Where no file speaks for a part, what its code holds does: "only type definitions", "8 classes (…)".
    const said = parts.map(p => {
      const files = code.filter(m => m.area === p.area).sort((a, b) => users(b.file).length - users(a.file).length || b.lines - a.lines);
      const best = files.slice(0, 4).map(m => ({ m, r: role(m.file) })).find(x => speaksForFile(x.r, x.m.file, name));
      if (best) return { p, n: files.length, documented: 1, text: `In ${p.title}, the key file is ${say(best.m.file)}. ${first(best.r!.text)}`, show: first(best.r!.text), cite: { file: best.m.file, line: best.r!.line } as Cite };
      const holds = holdsOf(files.flatMap(m => m.symbols));
      const at = files.find(m => m.symbols.some(s => s.exported));
      return holds && at ? { p, n: files.length, documented: 0, text: `${p.title}: ${holds}`, show: holds, cite: { file: at.file, line: at.symbols.find(s => s.exported)!.line } as Cite } : null;
    }).filter(x => x !== null).sort((a, b) => b.documented - a.documented || b.n - a.n).slice(0, 2);
    S.push({
      kind: 'map', title: 'Its parts',
      nodes: parts.map(n => ({ id: n.id, label: n.title, sub: n.sub.split(' · ')[0] ?? '', col: n.col, row: n.row, rows: n.rows, heart: n.heart, entry: false })),
      edges: ov.edges.filter(e => e.drawn && parts.some(p => p.id === e.from) && parts.some(p => p.id === e.to)).map(e => ({ id: `${e.from}>${e.to}`, from: e.from, to: e.to })),
      roles: said.map(d => ({ id: d.p.id, text: d.show, quote: d.documented === 1 })),
      beats: [
        { say: `Inside, the code is split into ${plural(parts.length, 'part')}: ${list(parts.slice(0, 5).map(p => p.title))}${parts.length > 5 ? ', and more' : ''}.`, focus: parts.map(p => p.id) },
        ...said.map(d => ({ say: d.text, focus: [d.p.id], cite: d.cite })),
      ],
    });
  }

  // 5. What happens when you use it: from the front door to the files it leans on most, each said as what it is.
  const entry = reading.route?.[0] ?? model.entries[0]?.file;
  if (entry && byFile.has(entry)) {
    // The files the front door hands work to: the ones with the most logic (lines) and the most users, not a file
    // of type declarations, and never two that say the same thing.
    const logic = (f: string) => { const m = byFile.get(f)!; return !m.symbols.length || m.symbols.some(s => s.kind !== 'type'); };
    const score = (f: string) => byFile.get(f)!.lines / 100 + users(f).length;
    const next = byFile.get(entry)!.imports.filter(f => byFile.has(f) && !byFile.get(f)!.test && logic(f)).sort((a, b) => score(b) - score(a));
    const route = reading.route && reading.route.length >= 3 ? reading.route.slice(0, 3) : [entry, ...next.slice(0, 2)];
    const seen = new Set<string>();
    const steps = route.map((file, i) => ({ id: `s${i}`, file, w: what(file) })).map(s => {
      if (s.w && seen.has(s.w.text)) return { ...s, w: null };
      if (s.w) seen.add(s.w.text);
      return s;
    });
    const edge = (a: string, b: string) => model.edges.find(e => e.from === a && e.to === b);
    S.push({
      kind: 'flow', title: 'When you use it', steps: steps.map(s => ({ id: s.id, file: s.file, text: s.w?.text ?? '' })),
      beats: steps.map((s, i) => {
        const prev = steps[i - 1], e = prev ? edge(prev.file, s.file) ?? edge(route[0]!, s.file) : undefined;
        const lead = i === 0 ? `You come in through ${say(s.file)}.` : `${say(e?.from ?? route[0]!)} imports ${say(s.file)}.`;
        return { say: `${lead}${s.w ? ` ${stop(s.w.text)}` : ''}`, focus: [s.id], cite: i === 0 ? s.w?.cite ?? { file: s.file } : e ? { file: e.from, line: e.line } : { file: s.file } };
      }),
    });
  }

  // 6. Where to start reading: the same order the repository page gives.
  const start = reading.files.slice(0, 3);
  if (start.length) {
    const minutes = start.reduce((n, f) => n + f.minutes, 0);
    S.push({
      kind: 'start', title: 'Where to start reading', items: start.map((f, i) => ({ id: `r${i}`, file: f.file, minutes: f.minutes })),
      beats: [{ say: `To read it yourself, start with ${list(start.map(f => say(f.file)))}: about ${plural(minutes, 'minute')}.`, focus: start.map((_, i) => `r${i}`), cite: { file: start[0]!.file } }],
    });
  }

  // 7. Before you change it: the file most of it leans on, how far a change there travels, and whether tests follow.
  const heart = reading.heart ? byFile.get(reading.heart) : model.core[0];
  if (heart) {
    const reach = blastRadius(heart.file, model.edges) as Map<string, number>;
    const source = [...reach].filter(([f]) => !byFile.get(f)?.test);
    const tests = model.testsReaching(heart.file);
    const band = (lo: number, hi: number) => source.filter(([, h]) => h >= lo && h <= hi).map(([f]) => f);
    const bands = [{ id: 'b1', label: 'Import it', files: band(1, 1) }, { id: 'b2', label: 'Two steps out', files: band(2, 2) }, { id: 'b3', label: 'Three or more', files: band(3, Infinity) }]
      .filter(b => b.files.length);
    const first = users(heart.file)[0], e = first ? model.edges.find(x => x.from === first && x.to === heart.file) : undefined;
    S.push({
      kind: 'reach', title: 'Before you change it', center: heart.file, bands, tests: tests.length, read: code.length,
      beats: [{
        say: `Most of it leans on ${say(heart.file)}: change it, and ${plural(source.length, 'other file')} can feel it${tests.length ? `, with ${plural(tests.length, 'test file')} to tell you` : ', and no test among the files read reaches it'}.`,
        focus: [...bands.map(b => b.id), 'tests'], ...(e ? { cite: { file: e.from, line: e.line } } : {}),
      }],
    });
  }

  S.push({ kind: 'end', title: 'The receipts', name, url: about.url, beats: [{ say: `That is ${name}. Every sentence in this film links to the line it came from, in the transcript below.`, focus: ['name'] }] });
  return { repo: about.repo, sha: about.sha, scenes: S };
}

/** A beat's length when nothing is speaking it: about 170 words a minute, plus a breath. */
export const readTime = (text: string) => Math.round((text.split(/\s+/).length / 170) * 60_000) + 450;
