// Measures both import analyzers against bench/truth.json, hand-labelled imports of four repositories
// at fixed commits, and writes bench/ACCURACY.md. Nothing from the repositories is run.
//
//   node bench/accuracy.ts [folder for the clones]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from '../src/graph.ts';
import { localModel } from '../src/mcp.ts';

type Repo = { name: string; commit: string; files: string[]; edges?: [string, string][]; edgesBySource?: Record<string, string[]>; external?: Record<string, string[]> };
const truth: { repos: Repo[] } = JSON.parse(readFileSync(new URL('./truth.json', import.meta.url), 'utf8'));
const base = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'rr-acc-'));
mkdirSync(base, { recursive: true });

/** A checkout of `name` at `commit`, cloned once. */
function checkout(name: string, commit: string): string {
  const dir = join(base, name.replace('/', '__'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, stdio: 'ignore', timeout: 300_000 });
  if (!existsSync(dir)) execFileSync('git', ['clone', '--quiet', '--filter=blob:none', `https://github.com/${name}.git`, dir], { stdio: 'ignore', timeout: 300_000 });
  git('checkout', '--quiet', '--detach', commit);
  return dir;
}

const edgesOf = (r: Repo): string[] => r.edges ? r.edges.map(([a, b]) => `${a} -> ${b}`)
  : Object.entries(r.edgesBySource!).flatMap(([a, bs]) => bs.map(b => `src/requests/${a}.py -> src/requests/${b}.py`));

interface Score { tp: number; fp: string[]; fn: string[] }
function score(found: Set<string>, want: Set<string>): Score {
  return { tp: [...found].filter(x => want.has(x)).length, fp: [...found].filter(x => !want.has(x)).sort(), fn: [...want].filter(x => !found.has(x)).sort() };
}
const pct = (n: number, d: number) => (d ? `${(100 * n / d).toFixed(1)}%` : 'n/a');
const pr = (s: Score) => `precision ${pct(s.tp, s.tp + s.fp.length)}, recall ${pct(s.tp, s.tp + s.fn.length)} (${s.tp} right, ${s.fp.length} wrong, ${s.fn.length} missed)`;

const analyzers: Record<string, (dir: string) => { file: string; imports: string[]; external: string[] }[]> = {
  'web/analyze.js (website, MCP server)': dir => localModel(dir).modules,
  'src/graph.ts (CLI: graph, check, pr)': dir => analyze(dir).modules,
};

let md = `# Import accuracy against hand-labelled repositories\n\nProduced by \`node bench/accuracy.ts\` on ${new Date().toISOString().slice(0, 10)}. Ground truth: [truth.json](truth.json), which says how it was labelled. Four small repositories is a small sample: these numbers describe these files, not every codebase.\n`;
const totals: Record<string, { edges: Score[]; ext: Score[] }> = {};
for (const r of truth.repos) {
  const dir = checkout(r.name, r.commit);
  const listed = new Set(r.files);
  md += `\n## ${r.name} @ ${r.commit}\n\n${r.files.length} files labelled.\n\n`;
  for (const [label, run] of Object.entries(analyzers)) {
    const mods = run(dir).filter(m => listed.has(m.file));
    const found = new Set(mods.flatMap(m => m.imports.filter(t => listed.has(t) && t !== m.file).map(t => `${m.file} -> ${t}`)));
    const e = score(found, new Set(edgesOf(r)));
    (totals[label] ??= { edges: [], ext: [] }).edges.push(e);
    md += `**${label}**\n\n- Imports between files: ${pr(e)}\n`;
    if (r.external) {
      const fx = new Set(mods.flatMap(m => [...new Set(m.external)].filter(x => !x.startsWith('node:')).map(x => `${m.file}: ${x}`)));
      const wx = new Set(Object.entries(r.external).flatMap(([f, xs]) => xs.map(x => `${f}: ${x}`)));
      const s = score(fx, wx);
      totals[label].ext.push(s);
      md += `- Outside packages: ${pr(s)}\n`;
      for (const x of s.fp) md += `  - wrong package: \`${x}\`\n`;
      for (const x of s.fn) md += `  - missed package: \`${x}\`\n`;
    }
    for (const x of e.fp) md += `  - wrong import: \`${x}\`\n`;
    for (const x of e.fn) md += `  - missed import: \`${x}\`\n`;
    const absent = r.files.filter(f => !mods.some(m => m.file === f));
    if (absent.length) md += `  - files not read at all: ${absent.map(f => `\`${f}\``).join(', ')}\n`;
    md += '\n';
  }
}
md += `## All four together\n\n| Analyzer | Imports between files | Outside packages (3 repos) |\n|---|---|---|\n`;
const sum = (ss: Score[]): Score => ({ tp: ss.reduce((n, s) => n + s.tp, 0), fp: ss.flatMap(s => s.fp), fn: ss.flatMap(s => s.fn) });
for (const [label, t] of Object.entries(totals)) md += `| ${label} | ${pr(sum(t.edges))} | ${pr(sum(t.ext))} |\n`;
writeFileSync(new URL('./ACCURACY.md', import.meta.url), md);
console.log(md);
