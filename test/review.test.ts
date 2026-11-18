// `reporeel review` on a real git history: the changed files, what reaches them, the tests on those
// paths, renames and removals, all from the diff against the merge base.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { changesSince, reviewMarkdown } from '../src/review.ts';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'rr-review-'));
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, stdio: 'ignore' });
  const put = (f: string, body: string) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); };
  // db is imported by api and jobs, api by the cli; a test covers api. old.ts nothing imports.
  put('src/db.ts', 'export const q = 1;\n');
  put('src/api.ts', "import { q } from './db';\nexport const a = q;\n");
  put('src/jobs.ts', "import { q } from './db';\nexport const j = q;\n");
  put('src/cli.ts', "import { a } from './api';\nconsole.log(a);\n");
  put('src/old.ts', 'export const o = 1;\n');
  put('test/api.test.ts', "import { a } from '../src/api';\n");
  git('init', '-q', '-b', 'main'); git('add', '.'); git('commit', '-qm', 'base');
  git('checkout', '-qb', 'feature');
  put('src/db.ts', 'export const q = 2;\nexport const r = 3;\n');
  git('mv', 'src/jobs.ts', 'src/worker.ts');
  rmSync(join(dir, 'src/old.ts'));
  put('README.md', '# x\n');
  git('add', '-A'); git('commit', '-qm', 'change');
  return dir;
}

test('changesSince lists what changed since the merge base, with renames under their new name', () => {
  const c = changesSince(repo(), 'main');
  const by = Object.fromEntries(c.map(x => [x.filename, x]));
  assert.deepEqual(Object.keys(by).sort(), ['README.md', 'src/db.ts', 'src/old.ts', 'src/worker.ts']);
  assert.deepEqual([by['src/db.ts'].status, by['src/db.ts'].additions, by['src/db.ts'].deletions], ['modified', 2, 1]);
  assert.equal(by['src/worker.ts'].status, 'renamed');
  assert.equal(by['src/old.ts'].status, 'removed');
  assert.equal(by['README.md'].status, 'added');
});

test('the review says what the change reaches and which tests sit on the way, and nothing it cannot back', () => {
  const md = reviewMarkdown(repo(), 'main');
  assert.match(md, /^<!-- repotale-review -->\n## RepoTale review: /);
  // db.ts reaches api, cli and worker (3 source files); the api test reaches it.
  assert.match(md, /\| `src\/db\.ts` \| modified \+2 −1 \| 3 \| 1 \|/);
  assert.match(md, /test\/api\.test\.ts/);
  assert.match(md, /Not in the import graph \(not source code, or removed\): [^\n]*`src\/old\.ts`/);
  assert.match(md, /`README\.md`/);
  assert.match(md, /nothing was run/);
  // Numbers in the reasons match the table: source files and tests are counted apart.
  for (const m of md.matchAll(/reaches? (\d+) /g)) assert.ok(+m[1] <= 4, m[0]);
});

test('no change, no claims', () => {
  const dir = repo();
  assert.match(reviewMarkdown(dir, 'HEAD'), /No files changed between `HEAD` and HEAD/);
});


test('the review carries its comment marker, and only a real pull request address becomes a link', () => {
  const dir = repo();
  const ok = reviewMarkdown(dir, 'main', 'https://github.com/owner/name/pull/12');
  assert.ok(ok.startsWith('<!-- repotale-review -->'));
  assert.ok(ok.includes('https://harshdubey23.github.io/RepoTale/#pr=https%3A%2F%2Fgithub.com%2Fowner%2Fname%2Fpull%2F12'));
  for (const bad of ['https://evil.example/pull/1', 'https://github.com/a/b/pull/1)](javascript:alert(1)', 'https://github.com/a/b/pull/1\n# injected'])
    assert.ok(!reviewMarkdown(dir, 'main', bad).includes('Explore what this change'), bad);
});
