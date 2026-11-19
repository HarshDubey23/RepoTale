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

// A citation covers exactly its import statement, in each language the engine reads.
const src = (s: string) => s.split('\n');
assert.equal(statementEnd(src("import ky from './ky.js';\nconst a = 1;"), 1, 'a.ts'), 1);
assert.equal(statementEnd(src("import {\n  a,\n  b,\n} from './x.js';\nfoo();"), 1, 'a.ts'), 4);
assert.equal(statementEnd(src("const x = require('./x');"), 1, 'a.js'), 1);
assert.equal(statementEnd(src('from .ctx import AppContext\nfrom .globals import g\nx = 1'), 1, 'app.py'), 1);
assert.equal(statementEnd(src('from .helpers import (\n    a,\n    b,\n)\nx = 1'), 1, 'app.py'), 4);
assert.equal(statementEnd(src('import (\n\t"fmt"\n\t"example.com/m/x"\n)'), 3, 'main.go'), 3);
assert.equal(statementEnd(src(`import {\n${'  a,\n'.repeat(50)}`), 1, 'a.ts'), 1); // no end in sight: one line, not a guess

const LIVE = 'https://harshdubey23.github.io/RepoTale/';
assert.equal(target("sindresorhus/ky"), "/r/sindresorhus/ky");
assert.equal(target(" https://github.com/sindresorhus/ky.git "), "/r/sindresorhus/ky");
assert.equal(target("github.com/sindresorhus/ky/tree/main/source?x=1#y"), "/r/sindresorhus/ky");
assert.equal(target('https://github.com/vercel/next.js/pull/123/files'), `${LIVE}#pr=${encodeURIComponent('https://github.com/vercel/next.js/pull/123')}`);
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
