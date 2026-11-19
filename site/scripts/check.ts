// Self-checks for the landing page's own logic. Run: npm run check
import assert from 'node:assert/strict';
import ky from '../fixtures/ky.json' with { type: 'json' };
import { layout } from '../lib/layout.ts';
import { target } from '../lib/target.ts';

const LIVE = 'https://harshdubey23.github.io/RepoTale/';
assert.equal(target('sindresorhus/ky'), `${LIVE}#/sindresorhus/ky`);
assert.equal(target(' https://github.com/sindresorhus/ky.git '), `${LIVE}#/sindresorhus/ky`);
assert.equal(target('github.com/sindresorhus/ky/tree/main/source?x=1#y'), `${LIVE}#/sindresorhus/ky`);
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
