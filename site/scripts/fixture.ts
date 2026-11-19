// Builds fixtures/<name>.json: a real repository, read by RepoTale's own engine at a pinned commit, reduced
// to what the landing page shows. Nothing is typed in by hand: every module, import, line number and code
// excerpt comes from the clone. Run: npm run fixture -- sindresorhus/ky [commit]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localModel } from '../../src/mcp.ts';
// @ts-ignore: plain ES module shared with the website, the CLI and the MCP server
import { startHere } from '../../web/insight.js';

interface Mod { file: string; lines: number; test: boolean; imports: string[]; importedBy: string[]; symbols: { name: string; line: number; exported: boolean }[] }
interface Edge { from: string; to: string; line: number; names?: string[] }

const [repo = 'sindresorhus/ky', want] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'rt-fixture-'));
const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
execFileSync('git', ['clone', '--quiet', '--filter=blob:none', `https://github.com/${repo}.git`, dir], { stdio: 'ignore' });
if (want) git('checkout', '--quiet', '--detach', want);
const sha = git('rev-parse', 'HEAD');

const model = localModel(dir) as { modules: Mod[]; edges: Edge[] };
const byFile = new Map(model.modules.map(m => [m.file, m]));
const code = model.modules.filter(m => !m.test);
const reading = startHere({ ...model, meta: { ...(model as any).meta, name: repo.split('/')[1] } });

// The diagram: the reading route plus the most connected source files, at most nine (legible on a phone).
const MAX = 9;
const score = (m: Mod) => m.importedBy.filter(f => !byFile.get(f)?.test).length * 2 + m.imports.length;
const picked = [...new Set<string>([...(reading.route ?? []), ...code.sort((a, b) => score(b) - score(a)).map(m => m.file)])].slice(0, MAX);
const inGraph = new Set(picked);
const edges = model.edges.filter(e => inGraph.has(e.from) && inGraph.has(e.to) && e.from !== e.to);
const entry: string = reading.route?.[0] ?? picked[0];

// Layers by longest path from the entry (cycles cut by visiting each file once per walk), so imports read left to right.
const layer = new Map<string, number>([[entry, 0]]);
for (let pass = 0; pass < picked.length; pass++)
  for (const e of edges) if (layer.has(e.from) && (layer.get(e.to) ?? -1) < layer.get(e.from)! + 1 && layer.get(e.from)! + 1 < picked.length) layer.set(e.to, layer.get(e.from)! + 1);
for (const f of picked) if (!layer.has(f)) layer.set(f, 1);
const cols = [...new Set(layer.values())].sort((a, b) => a - b);
const COL = 220, ROW = 72, PAD = 24, NODE_W = 172, NODE_H = 44;
const nodes = picked.map(f => {
  const c = cols.indexOf(layer.get(f)!), mates = picked.filter(g => layer.get(g) === layer.get(f)), r = mates.indexOf(f);
  const m = byFile.get(f)!;
  return { id: f, label: f.split('/').pop()!.replace(/\.[a-z]+$/, ''), col: c, row: r, rows: mates.length, lines: m.lines,
    users: m.importedBy.filter(g => !byFile.get(g)?.test).length, entry: f === entry, heart: f === reading.heart };
});
const height = Math.max(...nodes.map(n => n.rows)) * ROW;
const placed = nodes.map(n => ({ ...n, x: PAD + n.col * COL, y: PAD + (height - n.rows * ROW) / 2 + n.row * ROW, w: NODE_W, h: NODE_H }));

// Each edge's evidence: the import statement and three lines either side, exactly as committed.
const source = (f: string) => readFileSync(join(dir, f), 'utf8').split(/\r?\n/);
// Verified means the cited line itself names the imported file: checked here, not assumed.
// An import can span lines ("import type {" … "} from './x.js'"): the citation covers the whole statement.
const cited = edges.map(e => {
  const all = source(e.from);
  let end = e.line;
  while (end < all.length && end - e.line < 40 && !/\bfrom\s+['"]|\brequire\(|import\s*\(|^\s*import\s+['"]/.test(all[end - 1])) end++;
  const stem = e.to.split('/').pop()!.replace(/\.[a-z]+$/, '').replace(/^index$/, e.to.split('/').slice(-2, -1)[0] ?? 'index');
  const statement = all.slice(e.line - 1, end).join('\n');
  const start = Math.max(1, e.line - 2);
  return { from: e.from, to: e.to, line: e.line, end, names: (e.names ?? []).slice(0, 4), start, code: all.slice(start - 1, Math.min(all.length, end + 2)), verified: statement.includes(stem) };
});

const out = {
  repo, sha, url: `https://github.com/${repo}`, builtWith: 'RepoTale engine (web/analyze.js, web/insight.js)', builtAt: new Date().toISOString().slice(0, 10),
  stats: { modules: code.length, tests: model.modules.length - code.length, imports: model.edges.filter(e => !byFile.get(e.from)?.test && !byFile.get(e.to)?.test).length },
  entry, heart: reading.heart,
  size: { w: PAD * 2 + (cols.length - 1) * COL + NODE_W, h: PAD * 2 + height - (ROW - NODE_H) },
  nodes: placed, edges: cited,
  startHere: reading.files.map((f: { file: string; why: string; minutes: number }) => ({ file: f.file, why: f.why, minutes: f.minutes, line: byFile.get(f.file)?.symbols.find(s => s.exported)?.line ?? 1 })),
};
const name = repo.split('/')[1];
const file = join(import.meta.dirname, '..', 'fixtures', `${name}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`${file}: ${repo}@${sha.slice(0, 7)}, ${placed.length} nodes, ${cited.length} edges, entry ${entry}, heart ${reading.heart}`);
if (!existsSync(file)) process.exitCode = 1;
