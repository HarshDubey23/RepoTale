// How repository commands are run, attacked from the storyboard side: where they run, what they
// can reach, and whether their failures survive all the way into the video.
import assert from 'node:assert/strict';

import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { requireDocker, runCommand, within } from '../src/exec.ts';
import { render } from '../src/render.ts';
import { validate } from '../src/storyboard.ts';
import { js, sceneHtml } from '../src/templates.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'rr-exec-'));
const node = (code: string) => `node -e "${code}"`;

test('a terminal scene cwd must stay inside the repository', () => {
  const sb = (cwd: unknown) => ({ title: 'x', scenes: [{ type: 'terminal', commands: ['ls'], cwd, say: 's' }] });
  for (const cwd of ['..', '../x', 'a/../../b', '/etc', 'C:\\Windows', '\\\\server\\share', 'a\\..\\..', 3])
    assert.match(validate(sb(cwd)).join('\n'), /cwd: must be a folder inside the repo/, String(cwd));
  for (const cwd of [undefined, '.', 'packages/app', 'a..b', '.config'])
    assert.deepEqual(validate(sb(cwd)), [], String(cwd));
});

test('within() follows symlinks: a link inside the repo that points out of it is outside', t => {
  const repo = tmp(), outside = tmp();
  mkdirSync(join(repo, 'src'));
  assert.ok(within(repo, join(repo, 'src')));
  assert.ok(within(repo, repo));
  assert.ok(within(repo, join(repo, 'not-yet-created')));
  assert.ok(!within(repo, outside));
  assert.ok(!within(repo, join(repo, '..')));
  try { symlinkSync(outside, join(repo, 'escape'), 'junction'); } catch (e) { return t.skip(`cannot create a link here: ${(e as Error).message}`); }
  assert.ok(!within(repo, join(repo, 'escape')), 'a junction or symlink out of the repo is outside');
  assert.throws(() => runCommand('echo hi', { repoDir: repo, cwd: 'escape', timeoutMs: 5000 }), /outside the repository/);
});

test("a repository's own node --test really runs even when reporeel itself runs under a test runner", () => {
  // This file runs under node --test, so NODE_TEST_CONTEXT is set here, as it was in CI's render test.
  assert.ok(process.env.NODE_TEST_CONTEXT, 'precondition: running under node --test');
  const repo = tmp();
  writeFileSync(join(repo, 'a.test.mjs'), "import { test } from 'node:test'; test('real', () => {});\n");
  const r = runCommand('node --test', { repoDir: repo, timeoutMs: 60_000 });
  assert.equal(r.code, 0);
  assert.match(r.out, /# pass 1/, 'the test ran instead of being skipped as a nested run');
});

test('runCommand keeps the exit code, stdout and stderr, and reports a timeout as one', () => {
  const repo = tmp();
  const ok = runCommand(node("console.log('fine')"), { repoDir: repo, timeoutMs: 20_000 });
  assert.deepEqual([ok.code, ok.timedOut, ok.out.trim()], [0, false, 'fine']);
  const bad = runCommand(node("console.log('1 passing'); console.error('1 failing'); process.exit(3)"), { repoDir: repo, timeoutMs: 20_000 });
  assert.equal(bad.code, 3, 'the real exit code, even when the output says "passing"');
  assert.match(bad.out, /1 passing[\s\S]*1 failing/, 'stderr is kept after stdout');
  const slow = runCommand(node('setTimeout(() => {}, 60000)'), { repoDir: repo, timeoutMs: 1500 });
  assert.deepEqual([slow.code, slow.timedOut], [null, true]);
  writeFileSync(join(repo, 'here.txt'), 'x');
  mkdirSync(join(repo, 'sub'));
  assert.equal(runCommand(node("process.exit(require('fs').existsSync('../here.txt') ? 0 : 1)"), { repoDir: repo, cwd: 'sub', timeoutMs: 20_000 }).code, 0, 'cwd is honoured');
});

test('a failed or timed-out command is shown as failed in the video, whatever its output says', async () => {
  const runs = [
    { cmd: 'npm test', code: 1, timedOut: false, out: 'all tests passed' },
    { cmd: 'npm run slow', code: null, timedOut: true, out: '' },
    { cmd: 'npm run ok', code: 0, timedOut: false, out: 'error count: 0' },
  ];
  const html = await sceneHtml({ type: 'terminal', commands: runs.map(r => r.cmd), say: 's', __runs: runs } as any, { accent: '#ff7a45', seconds: 5, repo: 'a/b', title: 't' });
  // The scene draws a verdict line per command from its exit code, not from its words.
  for (const s of ['r.timedOut ?', '✗ timed out', 'r.code === 0 ?', '✓ exit 0', "✗ exit ' + r.code"]) assert.ok(html.includes(s), s);
  const data = JSON.parse(html.match(/const runs = (\[[\s\S]*?\]), t =/)![1]);
  assert.deepEqual(data.map((r: any) => [r.code, r.timedOut]), [[1, false], [null, true], [0, false]]);
});

test('command output cannot close the scene script or inject markup', async () => {
  const evil = '</script><img src=x onerror=alert(1)><script>';
  assert.ok(!js({ out: evil }).includes('<'));
  assert.deepEqual(JSON.parse(js({ out: evil })), { out: evil });
  const html = await sceneHtml({ type: 'terminal', commands: ['x'], say: 's', __runs: [{ cmd: evil, code: 0, timedOut: false, out: evil }] } as any, { accent: '#ff7a45', seconds: 5, repo: 'a/b', title: 't' });
  assert.ok(!html.includes('<img src=x'), 'no raw markup from the command reaches the page');
  const diagram = await sceneHtml({ type: 'diagram', mermaid: `flowchart LR\n a["${evil}"]`, say: 's' } as any, { accent: '#ff7a45', seconds: 5, repo: 'a/b', title: 't' });
  assert.ok(!diagram.includes('<img src=x'));
});

test('asking for a sandbox without Docker stops before anything runs; it never falls back to the host', async () => {
  // Docker is made unreachable for this test by emptying PATH, whatever this machine has installed.
  const saved = { PATH: process.env.PATH, Path: process.env.Path };
  process.env.PATH = process.env.Path = tmp();
  try { await noDocker(); } finally { for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v); }
});

async function noDocker() {
  assert.throws(() => requireDocker(), /needs a running Docker[\s\S]*Nothing was run/);
  const dir = tmp(), proof = join(dir, 'ran-on-host').replaceAll('\\', '/');
  const sb: any = { title: 'x', voice: { provider: 'none' }, scenes: [{ type: 'terminal', commands: [node(`require('fs').writeFileSync('${proof}', 'x')`)], say: 'a' }] };
  await assert.rejects(render(sb, join(dir, 'reporeel.json'), { out: join(dir, 'out'), approve: () => true, sandbox: { image: 'node:22-slim' } }), /needs a running Docker/);
  assert.ok(!existsSync(proof), 'the command did not run on the host');
}

test('a storyboard cwd that escapes is refused before rendering, and app.start may not cd out of the repo', async () => {
  const dir = tmp();
  const sb: any = { title: 'x', voice: { provider: 'none' }, scenes: [{ type: 'terminal', commands: ['echo hi'], cwd: '../..', say: 'a' }] };
  await assert.rejects(render(sb, join(dir, 'reporeel.json'), { out: join(dir, 'out'), approve: () => true }), /cwd: must be a folder inside the repo/);
  const { startApp } = await import('../src/render.ts');
  await assert.rejects(startApp({ url: 'http://127.0.0.1:9/', start: 'cd ../.. && node server.js' }, dir, () => {}), /outside the repository/);
});
