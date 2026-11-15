// Runs the static parts of reporeel (graph, offline draft, evidence check) on real repositories and
// writes what was measured to bench/RESULTS.md. Nothing from the cloned repositories is executed.
//
//   node bench/run.ts [folder to keep the clones in]
//
// What the numbers are: counts and timings from this machine, at the commits listed. What they are
// not: accuracy. Nobody labelled the true architecture of these projects, so "resolved" means "the
// import points at a file that exists", not "the graph is right".
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../src/evidence.ts';
import { analyze } from '../src/graph.ts';
import { draft } from '../src/plan.ts';
import { validate } from '../src/storyboard.ts';

const REPOS = [
  'expressjs/express', 'sindresorhus/got', 'axios/axios', 'fastify/fastify', 'honojs/hono', 'vitejs/vite', 'preactjs/preact',
  'pmndrs/zustand', 'chalk/chalk', 'tj/commander.js', 'colinhacks/zod', 'prettier/prettier',
  'pallets/flask', 'psf/requests', 'fastapi/fastapi', 'pallets/click', 'encode/httpx', 'pytest-dev/pytest', 'Textualize/rich', 'django/django',
];

const base = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'rr-bench-'));
mkdirSync(base, { recursive: true });
const rows: Record<string, string | number>[] = [];
for (const repo of REPOS) {
  const dir = join(base, repo.replace('/', '__'));
  try {
    if (!existsSync(dir)) execFileSync('git', ['clone', '--quiet', '--depth', '1', `https://github.com/${repo}.git`, dir], { stdio: 'ignore', timeout: 300_000 });
    const t0 = performance.now(), g = analyze(dir), ms = Math.round(performance.now() - t0);
    const edges = g.modules.reduce((n, m) => n + m.imports.length, 0), miss = g.modules.reduce((n, m) => n + m.unresolved.length, 0);
    // The offline draft is the only planner that needs no key, so it is the one that can be measured here.
    let plan = 'failed', coverage = '', broken: number | string = '';
    try {
      const sb = draft(dir), errs = validate(sb);
      plan = errs.length ? `invalid (${errs.length})` : 'valid';
      if (!errs.length) { const r = check(sb, dir, g); broken = r.scenes.filter(s => s.status === 'broken').length; coverage = r.coverage === null ? 'n/a' : `${Math.round(r.coverage * 100)}%`; }
    } catch (e) { plan = `threw: ${(e as Error).message.split('\n')[0].slice(0, 60)}`; }
    rows.push({ repo, commit: g.commit?.slice(0, 7) ?? '', modules: g.modules.length, tests: g.modules.filter(m => m.test).length, symbols: g.symbols.length, edges, unresolved: miss,
      resolved: edges + miss ? `${(100 * edges / (edges + miss)).toFixed(1)}%` : 'n/a', isolated: g.modules.filter(m => !m.imports.length && !g.modules.some(o => o.imports.includes(m.file))).length, ms, plan, broken, coverage });
  } catch (e) { rows.push({ repo, commit: '', modules: 'error', tests: '', symbols: '', edges: '', unresolved: '', resolved: '', isolated: '', ms: '', plan: (e as Error).message.split('\n')[0].slice(0, 80), broken: '', coverage: '' }); }
  console.error(JSON.stringify(rows.at(-1)));
}

const cols = ['repo', 'commit', 'modules', 'tests', 'symbols', 'edges', 'unresolved', 'resolved', 'isolated', 'ms', 'plan', 'broken', 'coverage'];
const ok = rows.filter(r => typeof r.modules === 'number');
const sum = (k: string) => ok.reduce((n, r) => n + (r[k] as number), 0);
const md = `# Benchmark: static analysis on ${REPOS.length} real repositories

Produced by \`node bench/run.ts\` on ${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${process.platform}. Shallow clones at the commits listed; nothing from them was run.

| ${cols.join(' | ')} |
|${cols.map(() => '---').join('|')}|
${rows.map(r => `| ${cols.map(c => r[c]).join(' | ')} |`).join('\n')}

**Totals over the ${ok.length} that were analysed:** ${sum('modules')} modules, ${sum('symbols')} symbols, ${sum('edges')} import edges, ${sum('unresolved')} relative imports that point at no file (${(100 * sum('edges') / (sum('edges') + sum('unresolved'))).toFixed(1)}% resolved), ${(sum('ms') / 1000).toFixed(1)}s in total.

## How to read it

- **modules / tests / symbols**: TypeScript, JavaScript and Python files found, how many of them are test files by name, and top-level declarations.
- **edges**: imports that resolve to a file in the repository. **unresolved**: relative imports that do not. **resolved** is edges / (edges + unresolved).
- **isolated**: modules with no edge in or out. Some really are standalone (scripts, fixtures); others are reached in ways this analysis does not follow (path aliases, package names inside a monorepo, dynamic imports, entry points named in config).
- **plan / broken / coverage**: whether the offline draft storyboard is valid, how many of its scenes cite something that does not exist, and the share of its claim-making scenes that are observed or grounded. The draft only ever cites the manifests it read, so a high number here shows the draft does not invent citations, not that it is a good video. \`n/a\` means the draft made no claim to check.

## What this does not measure

- **Correctness of the graph.** There is no hand-labelled ground truth here. An edge is real by construction (its target file exists), but missing edges are not counted, and a low \`unresolved\` number does not mean nothing was missed.
- **Calls.** Only imports are followed.
- **Videos.** Rendering, narration and the Claude planner need a browser, ffmpeg and an API key; none of that ran here.
- **Safety under attack.** That is covered by \`test/security.test.ts\`, not by this run.
`;
writeFileSync(new URL('./RESULTS.md', import.meta.url), md);
console.log(md);
