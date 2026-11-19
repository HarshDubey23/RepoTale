// Self-checks for the landing page's own logic. Run: npm run check
import assert from 'node:assert/strict';
import ky from '../fixtures/ky.json' with { type: 'json' };
import { layout } from '../lib/layout.ts';
import { layers, statementEnd } from '../lib/shape.ts';

// Layers: the entry stays first even when a cycle leads back to it, every kept import runs forward, and
// the answer does not depend on the order the engine listed the imports in.
{
  const files = ['app', 'init', 'tpl', 'globals', 'ctx'];
  const edges = [{ from: 'app', to: 'tpl' }, { from: 'tpl', to: 'app' }, { from: 'init', to: 'app' }, { from: 'tpl', to: 'globals' },
    { from: 'app', to: 'globals' }, { from: 'ctx', to: 'globals' }, { from: 'globals', to: 'ctx' }, { from: 'app', to: 'ctx' }];
  const a = layers(files, edges, 'app'), b = layers(files, [...edges].reverse(), 'app');
  assert.deepEqual([...a].sort(), [...b].sort());
  assert.equal(a.get('app'), 0);
  // the walk opens ctx before globals (by name), so of the ctx/globals cycle it keeps ctx -> globals
  assert.deepEqual([a.get('tpl'), a.get('ctx'), a.get('globals')], [1, 1, 2]);
  assert.equal(a.get('init'), 0); // nothing in the map reaches it: it starts a column of its own
}
import { target } from '../lib/target.ts';
import { bands, importLine } from '../lib/wave.ts';
// @ts-expect-error: plain ES module shared with the website, the CLI and the MCP server
import { blastRadius } from '../../web/analyze.js';

// The Risk Wave: each reached file in the band of its shortest path, tests apart, the change itself in band 0.
{
  const modules = ['core.ts', 'a.ts', 'b.ts', 'c.ts', 'd.ts', 'x.ts', 'test/core.test.ts', 'test/a.test.ts'].map(file => ({ file, test: file.startsWith('test/') }));
  const e = (from: string, to: string, line = 1) => ({ from, to, line });
  const edges = [e('a.ts', 'core.ts', 3), e('x.ts', 'core.ts', 7), e('x.ts', 'b.ts'), e('b.ts', 'a.ts'), e('c.ts', 'b.ts'), e('d.ts', 'c.ts'),
    e('test/core.test.ts', 'core.ts'), e('test/a.test.ts', 'a.ts')];
  const w = bands(['core.ts'], [], modules, edges, blastRadius);
  assert.deepEqual(w.map(b => [b.hops, b.source, b.tests]), [
    [0, ['core.ts'], []], [1, ['a.ts', 'x.ts'], ['test/core.test.ts']], [2, ['b.ts'], ['test/a.test.ts']], [3, ['c.ts', 'd.ts'], []],
  ]);
  assert.deepEqual(importLine('core.ts', modules, edges), { file: 'a.ts', line: 3 }); // first importer by name, never a test
  assert.equal(importLine('d.ts', modules, edges), null);
}

// A citation covers exactly its import statement, in each language the engine reads.
const src = (s: string) => s.split('\n');
assert.equal(statementEnd(src("import ky from './ky.js';\nconst a = 1;"), 1, 'a.ts'), 1);
assert.equal(statementEnd(src("import {\n  a,\n  b,\n} from './x.js';\nfoo();"), 1, 'a.ts'), 4);
assert.equal(statementEnd(src("const x = require('./x');"), 1, 'a.js'), 1);
assert.equal(statementEnd(src('from .ctx import AppContext\nfrom .globals import g\nx = 1'), 1, 'app.py'), 1);
assert.equal(statementEnd(src('from .helpers import (\n    a,\n    b,\n)\nx = 1'), 1, 'app.py'), 4);
assert.equal(statementEnd(src('import (\n\t"fmt"\n\t"example.com/m/x"\n)'), 3, 'main.go'), 3);
assert.equal(statementEnd(src(`import {\n${'  a,\n'.repeat(50)}`), 1, 'a.ts'), 1); // no end in sight: one line, not a guess

assert.equal(target("sindresorhus/ky"), "/r/sindresorhus/ky");
assert.equal(target(" https://github.com/sindresorhus/ky.git "), "/r/sindresorhus/ky");
assert.equal(target("github.com/sindresorhus/ky/tree/main/source?x=1#y"), "/r/sindresorhus/ky");
assert.equal(target('https://github.com/vercel/next.js/pull/123/files'), '/r/vercel/next.js/pull/123');
for (const bad of ['', 'ky', 'not a repo', 'https://gitlab.com/a/b', 'a/b/c']) assert.equal(target(bad), null, bad);

// Every import is drawn, and no line passes through a box it does not connect.
let lanes = 0;
for (const o of ['h', 'v'] as const) {
  const l = layout(ky.nodes, ky.edges, o);
  assert.equal(l.wires.length, ky.edges.length);
  for (const w of l.wires) {
    const nums = w.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const pts = nums.flatMap((_, i) => (i % 2 ? [] : [[nums[i], nums[i + 1]]]));
    // a lane path is M, C, L, C: its straight run is points 3 to 4; curves stay inside the gaps between columns
    if (pts.length !== 8) continue;
    lanes++;
    const [[x1, y1], [x2, y2]] = [pts[3], pts[4]];
    for (let t = 0; t <= 1; t += 0.05) {
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      for (const b of l.boxes) if (b.id !== w.from && b.id !== w.to)
        assert.ok(!(x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h), `${o}: ${w.id} crosses ${b.id}`);
    }
  }
}
assert.ok(lanes > 10, 'lane routing was exercised');
console.log(`check: ok (${lanes} lane routes checked)`);

// The trust layer: the engine's verifyCitations on a small model, each result put on its level, and the text
// cut so every citation lands on its own check. The sample built from the ky fixture has one claim per level it shows.
import { judge, sample, segments } from '../lib/trust.ts';
// @ts-expect-error: plain ES module shared with the website, the CLI and the MCP server
import { verifyCitations } from '../../web/insight.js';
{
  const text = 'export function retry(n) {\n  return backoff(n);\n}\n';
  const modules = [{ file: 'src/retry.ts', text, lines: text.split('\n').length, symbols: [{ name: 'retry' }, { name: 'backoff' }] }];
  const answer = 'It calls `backoff` [src/retry.ts:2]. Then `retry` and `jitter` [src/retry.ts:1-2]. And `jitter` [src/retry.ts:3]. '
    + 'It is short [src/retry.ts:1]. Logs go here [src/retry.ts:99]. Config lives in [src/config.ts:1].';
  const checks = verifyCitations(answer, { modules });
  const how = (file: string) => ({ missing: file !== 'src/retry.ts', unreachable: false, lines: 4, sha: 'abcdef1234' });
  const levels = checks.map((c: { file: string }) => judge(c as never, how(c.file)).level);
  assert.deepEqual(levels, ['verified', 'inferred', 'unverified', 'unverified', 'invented', 'invented']);
  assert.match(judge(checks[1], how('src/retry.ts')).why, /`retry`.*not `jitter`/);
  assert.match(judge(checks[5], how('src/config.ts')).why, /No file at this path at commit abcdef1/);
  // GitHub not answering is never a verdict on the claim
  assert.equal(judge(checks[5], { missing: false, unreachable: true, lines: 0, sha: 'x' }).level, 'unverified');

  const segs = segments(answer);
  const cites = segs.flatMap(s => 'cite' in s ? [s.cite] : []);
  assert.deepEqual(cites, [0, 1, 2, 3, 4, 5]);
  assert.equal(segs.map(s => 'text' in s ? s.text : checks[s.cite].text).join(''), answer);

  // ky: the sample's first claim is a real import, the second names one thing the line lacks, the third is past the end
  const s = sample(ky as never), parts = segments(s).flatMap(x => 'cite' in x ? [x.cite] : []);
  assert.equal(parts.length, 3);
  assert.match(s, /\[source\/core\/Ky\.ts:\d+\]/);
}
console.log('trust layer: ok');
