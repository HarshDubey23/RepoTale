// Builds fixtures/<name>.json: a real repository, read by RepoTale's own engine at a pinned commit, reduced
// to what the landing page shows (lib/shape.ts, the same code live pages use). Nothing is typed in by hand.
// Run: npm run fixture -- sindresorhus/ky [commit]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localModel } from '../../src/mcp.ts';
// @ts-expect-error: plain ES module shared with the website, the CLI and the MCP server
import { startHere } from '../../web/insight.js';
import { shape, type EngineEdge, type EngineModule, type Reading } from '../lib/shape.ts';

const [repo = 'sindresorhus/ky', want] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), 'rt-fixture-'));
const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
execFileSync('git', ['clone', '--quiet', '--filter=blob:none', `https://github.com/${repo}.git`, dir], { stdio: 'ignore' });
if (want) git('checkout', '--quiet', '--detach', want);
const sha = git('rev-parse', 'HEAD');

const model = localModel(dir) as { modules: EngineModule[]; edges: EngineEdge[]; meta?: object };
const reading: Reading = startHere({ ...model, meta: { ...model.meta, name: repo.split('/')[1] } });
const out = shape(model, reading, f => readFileSync(join(dir, f), 'utf8').split(/\r?\n/), {
  repo, sha, url: `https://github.com/${repo}`, builtAt: new Date().toISOString().slice(0, 10),
});

const file = join(import.meta.dirname, '..', 'fixtures', `${repo.split('/')[1]}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`${file}: ${repo}@${sha.slice(0, 7)}, ${out.nodes.length} nodes, ${out.edges.length} edges (${out.edges.filter(e => e.verified).length} verified), entry ${out.entry}, heart ${out.heart}`);
