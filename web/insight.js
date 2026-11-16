// What a developer asks of a repository, answered from its import graph: where to start reading,
// what a change can break, which files answer a question, and whether an answer's citations are
// real. Pure functions over the model analyze.js builds, shared by the website and the CLI's MCP
// server, so both say the same thing.
import { blastRadius } from './analyze.js';
import { pathBetween } from './story.js';

const base = f => f.split('/').pop();
const LINES_PER_MINUTE = 40; // careful reading of unfamiliar code, not skimming

/** The files a newcomer should read first, in order: where it starts, the path it takes, the
 *  module everything leans on, then the next most used one. Each says why it is on the list. */
export function startHere(model, max = 5) {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const users = f => byFile.get(f).importedBy.filter(x => !byFile.get(x)?.test).length;
  const heart = model.core[0]?.file;
  const list = [];
  const add = (file, why) => { if (file && !list.some(x => x.file === file) && list.length < max) list.push({ file, why, lines: byFile.get(file).lines, minutes: Math.max(1, Math.round(byFile.get(file).lines / LINES_PER_MINUTE)) }); };
  // Start from the entry that reaches the most of the system by following its imports: that is the
  // program's real front door, not a helper script nothing happens to import.
  const reachOf = f => { const seen = new Set([f]), q = [f]; while (q.length) for (const g of byFile.get(q.shift())?.imports ?? []) if (!seen.has(g)) { seen.add(g); q.push(g); } return seen.size - 1; };
  // A library's front door may be imported back by its own types (ky's hooks import index), so
  // when nothing qualifies as an entry, the shallowest index or main file that imports most is it.
  const front = model.entries.length ? model.entries : model.modules.filter(m => !m.test && /^(index|main|mod|app|cli|server|__main__|__init__).[a-z]+$/.test(base(m.file)) && m.imports.length)
    .sort((a, b) => a.file.split('/').length - b.file.split('/').length || b.imports.length - a.imports.length).slice(0, 1);
  const routes = front.map(e => ({ e: e.file, reach: reachOf(e.file), path: heart ? pathBetween(e.file, heart, model.edges) : null })).filter(r => r.path);
  routes.sort((a, b) => b.reach - a.reach || a.path.length - b.path.length);
  const route = routes[0];
  if (route) {
    route.path.forEach((f, i) => add(f, i === 0 ? `Where it starts: the front door, pulling in ${byFile.get(f).imports.length} of its files.`
      : f === heart ? `The heart: ${users(f)} files import it. Most of what you read next leans on this.`
      : `Step ${i} on the way from ${base(route.path[0])} to ${base(heart)}: it is imported by ${users(f)} and imports ${byFile.get(f).imports.length}.`));
  } else {
    if (front[0]) add(front[0].file, `Where it starts: it pulls in ${front[0].imports.length} of its files.`);
    if (heart) add(heart, `The heart: ${users(heart)} files import it.`);
  }
  for (const c of model.core.slice(1)) add(c.file, `Used by ${users(c.file)} files; you will meet it everywhere.`);
  return { files: list, minutes: list.reduce((s, x) => s + x.minutes, 0), lines: list.reduce((s, x) => s + x.lines, 0) };
}

/** What a set of changed files can reach. `changes` are GitHub's pull request files
 *  ({ filename, status, additions, deletions }). Nothing is claimed about files that were not read. */
export function prImpact(model, changes) {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const read = changes.filter(c => byFile.has(c.filename));
  const notRead = changes.filter(c => !byFile.has(c.filename)).map(c => c.filename);
  const reach = new Map();
  for (const c of read) for (const [f, hops] of blastRadius(c.filename, model.edges)) if (!reach.has(f) || reach.get(f) > hops) reach.set(f, hops);
  for (const c of read) reach.delete(c.filename);
  const tests = new Set([...reach.keys()].filter(f => byFile.get(f).test));
  for (const c of read) if (byFile.get(c.filename).test) tests.add(c.filename);
  // Core for a reviewer: one of the most imported modules, and imported by at least three files.
  const core = new Set(model.core.filter(m => m.importedBy.length >= 3).map(m => m.file));
  const files = read.filter(c => !byFile.get(c.filename).test).map(c => {
    const r = blastRadius(c.filename, model.edges);
    const t = [...r.keys()].filter(f => byFile.get(f)?.test);
    return { file: c.filename, status: c.status, additions: c.additions ?? 0, deletions: c.deletions ?? 0, reach: r.size, tests: t.length, core: core.has(c.filename), area: byFile.get(c.filename).area };
  }).sort((a, b) => b.reach - a.reach);
  const dependents = [...reach.keys()].filter(f => !byFile.get(f).test);
  const untested = files.filter(f => f.tests === 0 && f.status !== 'removed');
  const areas = [...new Set([...files.map(f => f.area), ...dependents.map(f => byFile.get(f).area)])];
  // Risk is what a reviewer should look at first, in the order of what can hurt most.
  const risks = [
    ...files.filter(f => f.core).map(f => ({ file: f.file, why: `a core module: ${f.reach} files depend on it` })),
    ...untested.filter(f => f.reach > 0).map(f => ({ file: f.file, why: `no test among the files read reaches it, and ${f.reach} files depend on it` })),
    ...files.filter(f => f.status === 'removed' && f.reach > 0).map(f => ({ file: f.file, why: `removed, but ${f.reach} files imported it at the base of this change` })),
  ].filter((r, i, a) => a.findIndex(x => x.file === r.file) === i);
  const level = risks.some(r => /core module|removed/.test(r.why)) ? 'high' : risks.length ? 'medium' : 'low';
  return { files, dependents, tests: [...tests], untested, areas, risks, level, notRead, sampled: !!model.meta?.truncated };
}

const STOP = new Set('the a an and or of to in on for is are was be how does do what where which who why when this that it its with from by as at into can i we you'.split(' '));
const words = s => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));

/** The files most likely to answer a question: words of the question found in a file's path,
 *  its declarations and its text, then the graph (a file that imports a match counts a little). */
export function retrieve(model, question, k = 8) {
  const q = [...new Set(words(question))];
  if (!q.length) return model.core.slice(0, k).map(m => ({ file: m.file, score: 0 }));
  const score = new Map();
  for (const m of model.modules) {
    if (m.test && !/test/i.test(question)) continue;
    const path = words(m.file), syms = m.symbols.flatMap(s => words(s.name)), text = (m.text ?? '').toLowerCase();
    let s = 0;
    for (const w of q) {
      if (path.includes(w)) s += 6;
      if (syms.includes(w)) s += 4;
      const hits = text.split(w).length - 1;
      s += Math.min(5, hits) * 0.6;
    }
    if (s) score.set(m.file, s + Math.min(3, m.importedBy.length * 0.3));
  }
  for (const e of model.edges) if (score.get(e.to) > 4) score.set(e.from, (score.get(e.from) ?? 0) + 0.5);
  return [...score].sort((a, b) => b[1] - a[1]).slice(0, k).map(([file, s]) => ({ file, score: Math.round(s * 10) / 10 }));
}

/** The part of a file worth showing for a question: the lines around the best matches, numbered
 *  as they are in the file, within a budget. */
export function excerpt(model, file, question, budget = 80) {
  const m = model.modules.find(x => x.file === file);
  const lines = (m?.text ?? '').split('\n');
  if (lines.length <= budget) return lines.map((l, i) => `${i + 1}| ${l}`).join('\n');
  const q = words(question);
  const hit = lines.map((l, i) => [i, q.reduce((s, w) => s + (l.toLowerCase().includes(w) ? 1 : 0), 0)]).sort((a, b) => b[1] - a[1]);
  const keep = new Set();
  for (const [i] of hit) { if (keep.size >= budget) break; for (let j = Math.max(0, i - 6); j < Math.min(lines.length, i + 10); j++) keep.add(j); }
  const out = []; let last = -2;
  for (const i of [...keep].sort((a, b) => a - b).slice(0, budget)) { if (i !== last + 1) out.push('…'); out.push(`${i + 1}| ${lines[i]}`); last = i; }
  return out.join('\n');
}

/** Every [path:12] or [path:12-30] in an answer, checked against the code that was read: the file
 *  must exist and the lines must be inside it. An answer is only as good as its worst citation. */
export function verifyCitations(answer, model) {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const out = [];
  for (const m of answer.matchAll(/\[([\w./@+-]+\.[a-z]+)(?::(\d+)(?:-(\d+))?)?\]/gi)) {
    const [whole, file, a, b] = m, mod = byFile.get(file);
    const start = a ? +a : null, end = b ? +b : start;
    const ok = !!mod && (start === null || (start >= 1 && end >= start && end <= mod.lines));
    out.push({ text: whole, file, start, end, ok, why: !mod ? 'no such file was read' : ok ? '' : `lines outside the file (it has ${mod.lines})` });
  }
  return out;
}

/** A word reduced to its stem, so retries finds retry and handled finds handle. */
const stem = w => w.replace(/ies$/, 'y').replace(/(ing|ions?|ed|es|s)$/, '') || w;

/** A free, instant answer with no model: the code that answers the question in the files that hold
 *  it (declarations named after it first, then the densest block of lines that mention it), with
 *  real lines, and how those files connect. Everything is read from the code, nothing is claimed. */
export function answerFromGraph(model, question, k = 3) {
  const q = [...new Set(words(question).map(stem))];
  const near = w => q.some(x => x === w || (Math.min(x.length, w.length) >= 4 && (x.startsWith(w) || w.startsWith(x))));
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const top = retrieve(model, question, 6).map(r => byFile.get(r.file)).filter(Boolean);
  const focus = [];
  for (const [rank, m] of top.slice(0, k).entries()) {
    const lines = (m.text ?? '').split('\n');
    const syms = [...m.symbols].sort((a, b) => a.line - b.line);
    const picks = syms.map((s, i) => ({ name: s.name, kind: s.kind, start: s.line, end: Math.min((syms[i + 1]?.line ?? lines.length + 1) - 1, s.line + 24), score: words(s.name).map(stem).filter(near).length * 3 }))
      .filter(x => x.score > 0);
    // The densest 16-line block that mentions the question, for code inside classes and functions.
    const hits = lines.map(l => words(l).map(stem).filter(near).length);
    let best = 0, at = -1;
    for (let i = 0; i < lines.length; i++) { let n = 0; for (let j = i; j < Math.min(lines.length, i + 16); j++) n += hits[j]; if (n > best) { best = n; at = i; } }
    if (at >= 0 && best >= 2) picks.push({ name: null, kind: null, start: at + 1, end: Math.min(lines.length, at + 16), score: best });
    const chosen = [];
    for (const p of picks.sort((a, b) => b.score - a.score)) if (chosen.length < (rank === 0 ? 3 : 1) && !chosen.some(c => p.start <= c.end && c.start <= p.end)) chosen.push(p);
    for (const c of chosen.sort((a, b) => a.start - b.start)) focus.push({ file: m.file, ...c, code: lines.slice(c.start - 1, c.end).join('\n') });
  }
  const files = [...new Set(focus.map(f => f.file))];
  const links = model.edges.filter(e => files.includes(e.from) && files.includes(e.to) && e.from !== e.to).slice(0, 2);
  const usedBy = files[0] ? model.edges.filter(e => e.to === files[0]).slice(0, 5) : [];
  const said = focus.filter(f => f.name).map(f => `\`${f.name}\` in ${base(f.file)} (line ${f.start})`);
  const summary = !focus.length ? 'Nothing in the files read matches this question. Try the words the code would use, such as a function or file name.'
    : `Most of it is in ${base(files[0])}${said.length ? `: ${said.slice(0, 3).join(', ')}` : ''}.${links.length ? ' ' + links.map(e => `${base(e.from)} imports ${base(e.to)}${e.names?.length ? ` for ${e.names.slice(0, 3).join(', ')}` : ''}`).join('; ') + '.' : ''}`;
  return { summary, focus, links, usedBy, files };
}
