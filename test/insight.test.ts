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

// Each case below is a wrong reading order RepoTale gave on a real repository before it was fixed.
const modelOf = (t: Record<string, string>) => buildModel({ meta: { name: 'x', full: 'a/x', truncated: false }, paths: Object.keys(t), texts: t, manifests: {} });
const order = (t: Record<string, string>) => startHere(modelOf(t)).files.map(f => f.file);

test('Start here: a library starts at its __init__, even though its own modules import it back (Flask)', () => {
  const files = order({
    'src/lib/__init__.py': 'from .app import App\nfrom .core import run\nfrom .helpers import h\nfrom .helpers import h2\n',
    'src/lib/app.py': 'from .core import run\nfrom .helpers import h\n',
    'src/lib/core.py': 'from . import helpers\n',
    'src/lib/helpers.py': 'from . import core\n',
    // A public module nothing inside imports: it used to be taken for the front door.
    'src/lib/views.py': 'from .core import run\n',
    'tests/test_app.py': 'import lib\n',
  });
  assert.equal(files[0], 'src/lib/__init__.py');
});

test('Start here: docs examples, benchmarks and build scripts are never the front door (FastAPI, chalk, axios)', () => {
  const t = {
    'docs_src/app/main.py': 'from pkg import App\nfrom pkg.routing import r\nfrom pkg.params import p\nfrom pkg.core import c\n',
    'gulpfile.js': "require('./scripts/build.js');\n",
    'scripts/build.js': "require('./../pkg/index.js');\n",
    'benchmark.js': "require('./pkg/index.js');\n",
    'pkg/__init__.py': 'from .routing import r\nfrom .core import c\n',
    'pkg/routing.py': 'from .core import c\n',
    'pkg/params.py': 'from .core import c\n',
    'pkg/core.py': 'x = 1\n',
    'pkg/index.js': "require('./lib.js');\n",
    'pkg/lib.js': 'module.exports = 1;\n',
  };
  const s = startHere(modelOf(t));
  assert.equal(s.files[0].file, 'pkg/__init__.py');
  assert.ok(!s.files.some(f => /^(docs_src|scripts)\/|gulpfile|benchmark/.test(f.file)), s.files.map(f => f.file).join(', '));
});

test('Start here: the shallow index beats a deeper adapter index, and type files are not the heart (hono)', () => {
  const files = order({
    'src/index.ts': "export { Hono } from './hono';\n",
    'src/hono.ts': "import { Context } from './context';\nimport type { Env } from './types';\nimport { route } from './router';\n",
    'src/router.ts': "import type { Env } from './types';\nimport { Context } from './context';\n",
    'src/context.ts': "import type { Env } from './types';\n",
    'src/middleware/cors.ts': "import { Context } from '../context';\nimport type { Env } from '../types';\n",
    'src/types.ts': 'export type Env = {};\n',
    'src/adapter/bun/index.ts': "import { Hono } from '../../hono';\nimport { Context } from '../../context';\nimport { serve } from './serve';\n",
    'src/adapter/bun/serve.ts': "import type { Env } from '../../types';\n",
  });
  assert.equal(files[0], 'src/index.ts');
  assert.ok(files.includes('src/context.ts') && !files.includes('src/types.ts'), files.join(', '));
});

test('a file imported several times by name counts once, so "pulling in N files" is true (click said 69)', () => {
  const m = modelOf({ 'pkg/__init__.py': 'from .a import x\nfrom .a import y\nfrom .a import z\nfrom .b import w\n', 'pkg/a.py': 'x = y = z = 1\n', 'pkg/b.py': 'w = 1\n' });
  assert.deepEqual(m.modules.find(x => x.file === 'pkg/__init__.py')!.imports.sort(), ['pkg/a.py', 'pkg/b.py']);
  assert.match(startHere(m).files[0].why, /pulling in 2 of its files/);
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

test('the free answer shows the declarations that match, with their real lines and code, and how files connect', async () => {
  const { answerFromGraph } = await import('../web/insight.js');
  const a = answerFromGraph(model, 'how is the connection pool opened?');
  assert.equal(a.focus[0].file, 'src/db.ts');
  assert.equal(a.focus[0].name, 'connectPool');
  assert.equal(a.focus[0].start, 4);
  assert.match(a.focus[0].code, /^export function connectPool/);
  assert.match(a.summary, /`connectPool` in db\.ts \(line 4\)/);
  const b = answerFromGraph(model, 'how does billing charge?');
  assert.ok(b.links.some(e => e.from === 'src/billing.ts' && e.to === 'src/db.ts') || b.files.length >= 1);
  assert.match(answerFromGraph(model, 'zzzz qqqq').summary, /^Nothing in the files read/);
});
