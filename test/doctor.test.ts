import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { doctor } from '../src/doctor.ts';

const repo = (files: Record<string, string>) => {
  const d = mkdtempSync(join(tmpdir(), 'rr-'));
  for (const [f, c] of Object.entries(files)) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), c); }
  return d;
};
const get = (r: ReturnType<typeof doctor>, id: string) => r.checks.find(c => c.id === id)!;

test('an empty repo fails, a complete one passes', () => {
  assert.equal(doctor(repo({ 'index.js': 'x' })).grade, 'F');
  const good = doctor(repo({
    'README.md': '# Tool\n\nTool turns your repo into a narrated video for every visitor.\n\n![demo](demo.gif)\n\n## Quickstart\n\n```bash\nnpx tool\n```\n\n## How it works\n\nIt reads.\n\n## Contributing\n\nPRs welcome.\n',
    'demo.gif': 'GIF', LICENSE: 'MIT', 'test/a.test.js': '', '.github/workflows/ci.yml': 'on: push',
  }));
  assert.equal(good.score, 100, JSON.stringify(good.checks.filter(c => !c.ok)));
});

test('finds committed keys and .env files, but not examples', () => {
  const r = doctor(repo({ 'src/cfg.js': 'const k = "ghp_' + 'a'.repeat(36) + '"', '.env': 'X=1', '.env.example': 'X=', 'README.md': '# x' }));
  assert.equal(r.secrets.length, 1);
  assert.equal(r.secrets[0].kind, 'GitHub token');
  assert.match(get(r, 'secrets').detail, /committed \.env$/);
});

test('flags broken relative links and media below the fold', () => {
  const r = doctor(repo({ 'README.md': '# x\n\n[docs](docs/missing.md)\n' + '\nfiller\n'.repeat(30) + '![s](shot.png)\n', 'shot.png': '' }));
  assert.match(get(r, 'links').detail, /docs\/missing\.md/);
  assert.equal(get(r, 'demo-media').detail, 'media exists but is below the fold');
});
