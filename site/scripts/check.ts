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

// The film's script on a small project built by the engine itself. It must explain the project the way its
// authors do (the README's pitch, features, install line and first example; a file's own doc comment), every beat
// must point at something its scene draws, and every receipt must name a file that exists and a line inside it.
// A function's doc comment never stands for a whole part or file. The architecture places every box it draws.
import { archOf } from '../lib/arch.ts';
import { readReadme, roleOf, speaksForFile } from '../lib/explain.ts';
import { buildFilm } from '../lib/film.ts';
// @ts-expect-error: plain ES module shared with the website, the CLI and the MCP server
import { buildModel } from '../../web/analyze.js';
// @ts-expect-error: plain ES module shared with the website, the CLI and the MCP server
import { startHere } from '../../web/insight.js';
{
  const readme = [
    '<div align="center"><img src="logo.svg"></div>', '', '> Mini is a tiny HTTP client based on [fetch](https://example.com).', '',
    '[![badge](https://x/b.svg)](https://x)', '', '## Features', '', '- Retries failed requests', '- Method shortcuts (`mini.post()`)', '- Hooks', '',
    '## Install', '', '```sh', 'npm install mini', '```', '', '## Usage', '', '```js', "import mini from 'mini';", '', "const json = await mini.get('/a').json();", '```', '',
  ].join('\n');
  const texts: Record<string, string> = {
    'src/index.ts': "import { request } from './core/request.ts';\nimport { Options } from './types/options.ts';\nexport default function mini(o: Options) { return request(o); }\n",
    'src/core/request.ts': "/** Sends one request and hands failures to retry. */\n\nimport { Options } from '../types/options.ts';\nimport { retry } from './retry.ts';\nexport function request(o: Options) { return retry(o); }\n",
    'src/core/retry.ts': "import { Options } from '../types/options.ts';\nimport { request } from './request.ts';\n/** Retries a request until it gives up. */\nexport function retry(o: Options) { return o.retries ? request(o) : o; }\n",
    'src/types/options.ts': "// Options\nexport interface Options { retries: number }\nexport type Hook = () => void;\nexport const DEFAULTS = { retries: 2 };\n",
    'test/retry.test.ts': "import { retry } from '../src/core/retry.ts';\nretry({ retries: 0 });\n",
  };
  const files: Record<string, string> = { ...texts, 'README.md': readme };
  const lines = (f: string) => files[f]!.split('\n');

  const r = readReadme(readme);
  assert.equal(r.intro?.text, 'Mini is a tiny HTTP client based on fetch.');
  assert.equal(lines('README.md')[r.intro!.line - 1], '> Mini is a tiny HTTP client based on [fetch](https://example.com).');
  assert.deepEqual(r.features.map(f => f.text), ['Retries failed requests', 'Method shortcuts (mini.post())', 'Hooks']);
  assert.equal(r.install?.text, 'npm install mini');
  assert.equal(lines('README.md')[r.install!.line - 1], 'npm install mini');
  assert.equal(lines('README.md')[r.example!.line - 1], "import mini from 'mini';");

  // A module comment speaks for its file; a function's comment does not, even when it is the only comment.
  const req = roleOf(texts['src/core/request.ts']!, 'src/core/request.ts'), ret = roleOf(texts['src/core/retry.ts']!, 'src/core/retry.ts');
  assert.equal(req?.kind, 'module');
  assert.ok(speaksForFile(req, 'src/core/request.ts', 'mini'));
  assert.equal(ret?.kind, 'function');
  assert.ok(!speaksForFile(ret, 'src/core/retry.ts', 'mini'));
  assert.ok(speaksForFile({ text: 'Base class for all errors.', line: 1, kind: 'class', name: 'KyError' }, 'source/errors/KyError.ts', 'ky'));
  assert.ok(!speaksForFile({ text: 'Marker returned by retry.', line: 1, kind: 'class', name: 'RetryMarker' }, 'source/core/constants.ts', 'ky'));

  const model = buildModel({ meta: { name: 'mini', full: 'x/mini', description: '' }, paths: Object.keys(texts), texts, manifests: {} });
  const reading = startHere(model);
  const arch = archOf(model);
  const film = buildFilm(model, reading, arch, { repo: 'x/mini', sha: 'abcdef1', url: 'https://github.com/x/mini', description: '', readme, readmePath: 'README.md' });
  const kinds = film.scenes.map(s => s.kind);
  for (const k of ['title', 'features', 'usage', 'flow', 'start', 'reach', 'end'] as const) assert.ok(kinds.includes(k), `the film has a ${k} scene`);
  const drawn = (s: (typeof film.scenes)[number]): string[] =>
    s.kind === 'title' ? ['name', 'hook'] : s.kind === 'features' ? s.items.map(i => i.id) : s.kind === 'usage' ? ['install', 'example']
      : s.kind === 'map' ? [...s.nodes.map(n => n.id), ...s.edges.map(e => e.id)] : s.kind === 'flow' ? s.steps.map(x => x.id)
        : s.kind === 'start' ? s.items.map(i => i.id) : s.kind === 'reach' ? [...s.bands.map(b => b.id), 'tests'] : ['name'];
  for (const s of film.scenes) for (const b of s.beats) {
    for (const f of b.focus) assert.ok(drawn(s).includes(f), `${s.kind}: "${b.say}" focuses ${f}, which the scene does not draw`);
    if (b.cite) {
      assert.ok(files[b.cite.file], `${b.cite.file} exists`);
      if (b.cite.line) assert.ok(b.cite.line >= 1 && (b.cite.end ?? b.cite.line) <= lines(b.cite.file).length, `${b.cite.file}:${b.cite.line} is inside the file`);
    }
    assert.doesNotMatch(b.say, /Retries a request until/, 'a function comment is never said as what a file or part is');
  }
  const say = (k: string) => film.scenes.find(s => s.kind === k)!.beats.map(b => b.say).join(' ');
  assert.match(say('title'), /^This is mini\. Mini is a tiny HTTP client based on fetch\.$/);
  assert.match(say('features'), /retries failed requests, method shortcuts and hooks\.$/);
  assert.match(say('usage'), /npm install mini/);
  const usage = film.scenes.find(s => s.kind === 'usage')!;
  assert.ok(usage.kind === 'usage' && usage.lines[0] === "import mini from 'mini';");
  // The way in: the front door, then what it imports, each said in the file's own words when it has them.
  const flow = film.scenes.find(s => s.kind === 'flow')!;
  assert.ok(flow.kind === 'flow' && flow.steps[0]!.file === 'src/index.ts');
  const step = flow.beats.find(b => b.say.includes('request.ts'))!;
  assert.match(step.say, /^index\.ts imports request\.ts\. Sends one request and hands failures to retry\.$/);
  assert.equal(lines(step.cite!.file)[step.cite!.line! - 1], "import { request } from './core/request.ts';");
  // The architecture: every box has a place, and a drawn arrow runs forward.
  for (const v of [arch.overview, ...arch.parts].filter(Boolean)) {
    const col = new Map(v!.nodes.map(n => [n.id, n.col]));
    for (const n of v!.nodes) assert.ok(n.row < n.rows && n.col >= 0);
    for (const e of v!.edges.filter(x => x.drawn)) assert.ok(col.get(e.to)! > col.get(e.from)!, `${e.from} -> ${e.to} runs forward`);
  }
}
console.log('film script: ok');
