import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../web/analyze.js';
import { startHere, prImpact, retrieve, excerpt, verifyCitations } from '../web/insight.js';

// cli -> server -> db <- billing ; db is the heart; billing has no test; db.test covers db.
const texts = {
  'src/cli.ts': "import { serve } from './server';\nserve();\n",
  'src/server.ts': "import { query } from './db';\nimport { charge } from './billing';\nexport function serve() { query(); charge(); }\n",
  'src/db.ts': 'export function query() {\n  return connectPool();\n}\nexport function connectPool() { return 1; }\n',
  'src/billing.ts': "import { query } from './db';\nexport function charge() { return query(); }\n",
  'src/util.ts': "import { query } from './db';\nexport const x = query();\n",
  'test/db.test.ts': "import { query } from '../src/db';\nquery();\n",
};
const model = buildModel({ meta: { name: 'demo', full: 'a/demo', truncated: false }, paths: Object.keys(texts), texts, manifests: {} });

test('start here walks from the entry to the heart, in order, with reasons and reading time', () => {
  const s = startHere(model);
  assert.deepEqual(s.files.map(f => f.file).slice(0, 3), ['src/cli.ts', 'src/server.ts', 'src/db.ts']);
  assert.match(s.files[0].why, /^Where it starts/);
  assert.match(s.files[2].why, /^The heart: 3 files import it/);
  assert.ok(s.files.every(f => f.minutes >= 1 && f.lines > 0));
  assert.equal(s.lines, s.files.reduce((a, f) => a + f.lines, 0));
});

test('PR impact: what a change reaches, which tests cover it, and the risky files first', () => {
  const r = prImpact(model, [
    { filename: 'src/db.ts', status: 'modified', additions: 3, deletions: 1 },
    { filename: 'src/billing.ts', status: 'modified', additions: 5, deletions: 0 },
    { filename: 'docs/guide.md', status: 'added', additions: 9, deletions: 0 },
  ]);
  assert.deepEqual(r.files.map(f => f.file), ['src/db.ts', 'src/billing.ts']);
  assert.deepEqual(r.files.map(f => f.reach), [5, 2]);
  assert.deepEqual(r.notRead, ['docs/guide.md']);
  assert.ok(r.tests.includes('test/db.test.ts'));
  assert.deepEqual(r.dependents.sort(), ['src/cli.ts', 'src/server.ts', 'src/util.ts']);
  // db is core, so the change is high risk; billing reaches files but no test reaches it.
  assert.equal(r.level, 'high');
  assert.deepEqual(r.risks.map(x => x.file), ['src/db.ts', 'src/billing.ts']);
  assert.match(r.risks[1].why, /no test among the files read reaches it/);
  // A change to a leaf nothing imports is low risk.
  assert.equal(prImpact(model, [{ filename: 'src/util.ts', status: 'modified' }]).level, 'low');
});

test('retrieval finds the files a question is about, by path, declarations and text', () => {
  assert.equal(retrieve(model, 'How does billing charge a customer?')[0].file, 'src/billing.ts');
  assert.equal(retrieve(model, 'Where is the connection pool opened?')[0].file, 'src/db.ts');
  assert.match(excerpt(model, 'src/db.ts', 'pool'), /^1\| export function query/);
});

test('citations are checked against the code: real files and lines pass, invented ones are flagged', () => {
  const v = verifyCitations('Queries go through [src/db.ts:1-3], billing calls it [src/billing.ts:2], see [src/db.ts:40] and [src/payments.ts:1].', model);
  assert.deepEqual(v.map(c => c.ok), [true, true, false, false]);
  assert.match(v[2].why, /outside the file/);
  assert.equal(v[3].why, 'no such file was read');
});
