// What `plan` may send to Anthropic: nothing without a yes, never sensitive files, and no recognisable
// secret. Fake secrets are assembled at run time so this file does not trip reporeel's own secret scan.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { pack, planWithClaude, redact, shareSummary, ShareDeclined } from '../src/plan.ts';

const AWS = 'AKIA' + 'Q'.repeat(16);
const GH = 'ghp' + '_' + 'a'.repeat(36);
const KEY = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ') + '\nMIIEowIBAAKCAQEA\nabc\n' + ['-----END', 'RSA PRIVATE KEY-----'].join(' ');

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'rr-plan-'));
  const files: Record<string, string> = {
    'README.md': '# demo\n',
    'src/app.ts': `export const region = 'eu';\nconst aws = '${AWS}';\nconst gh = "${GH}";\n`,
    'src/keys.ts': `export const pem = \`${KEY}\`;\n`,
    '.env': `DB_PASSWORD=hunter2\n`, '.env.production': 'X=1\n', 'config/secrets.yaml': 'token: abc\n', 'certs/server.pem': 'x\n',
    '.npmrc': '//registry.npmjs.org/:_authToken=abc\n', 'deploy/service-account-prod.json': '{}\n', 'src/env.ts': 'export const env = process.env;\n',
  };
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), body); }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

test('redact replaces every recognised secret and counts them, leaving the code around them', () => {
  const r = redact(`a = '${AWS}'; b = '${GH}';\n${KEY}\nkeep = 'eu-west-1'`);
  assert.equal(r.count, 3);
  for (const s of [AWS, GH, 'MIIEowIBAAKCAQEA']) assert.ok(!r.text.includes(s), s);
  assert.match(r.text, /\[REDACTED AWS access key\][\s\S]*\[REDACTED GitHub token\][\s\S]*\[REDACTED private key\][\s\S]*keep = 'eu-west-1'/);
  assert.deepEqual(redact('nothing here'), { text: 'nothing here', count: 0 });
});

test('pack leaves sensitive files out by name, redacts the rest, and says so', () => {
  const p = pack(repo());
  assert.deepEqual(p.excluded.sort(), ['.env', '.env.production', '.npmrc', 'certs/server.pem', 'config/secrets.yaml', 'deploy/service-account-prod.json']);
  for (const f of p.excluded) assert.ok(!p.text.includes(`path="${f}"`) && !p.text.includes(`\n${f}\n`), `${f} is neither sent nor listed`);
  for (const s of [AWS, GH, 'MIIEowIBAAKCAQEA', 'hunter2', '_authToken']) assert.ok(!p.text.includes(s), s);
  assert.ok(p.sent.includes('src/app.ts') && p.sent.includes('src/env.ts'), 'ordinary code is still sent');
  assert.equal(p.redactions, 3);
  const summary = shareSummary(p, 'claude-opus-5-5');
  assert.match(summary, /api\.anthropic\.com[\s\S]*left out as sensitive: [\s\S]*\.env[\s\S]*3 secret\(s\) found/);
});

test('nothing is sent without an explicit yes', async () => {
  const dir = repo();
  const saved = process.env.ANTHROPIC_API_KEY;
  // A key that would be used if anything got as far as the network.
  process.env.ANTHROPIC_API_KEY = 'test-not-a-real-key';
  const seen: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (u: any) => { seen.push(String(u)); throw new Error('network'); }) as any;
  try {
    for (const confirm of [undefined, () => false, () => 'yes' as any, async () => false])
      await assert.rejects(planWithClaude(dir, { confirm }), (e: unknown) => e instanceof ShareDeclined);
    assert.deepEqual(seen, [], 'no request was made');
  } finally {
    globalThis.fetch = realFetch;
    saved === undefined ? delete process.env.ANTHROPIC_API_KEY : (process.env.ANTHROPIC_API_KEY = saved);
  }
});
