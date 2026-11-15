// The browser engine behind the website, checked on hand-made trees and on this repository itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseRepo, importsOf, symbolsOf, resolve, buildModel, cycles, blastRadius, aliasesFrom, pickFiles, detectStack, routesOf, headingOf, liveUrl } from '../web/analyze.js';
import { forEar } from '../web/voice.js';
import { buildArch, mermaidArch, nameOf, kindOf } from '../web/arch.js';
import { buildStory, storyboardOf, pathBetween, mermaidOf } from '../web/story.js';

test('parseRepo accepts what people paste and rejects the rest', () => {
  assert.deepEqual(parseRepo('https://github.com/expressjs/express'), { owner: 'expressjs', name: 'express', ref: null });
  assert.deepEqual(parseRepo('github.com/a/b.git/'), { owner: 'a', name: 'b', ref: null });
  assert.deepEqual(parseRepo('a/b/tree/dev'), { owner: 'a', name: 'b', ref: 'dev' });
  assert.equal(parseRepo('just-words'), null);
  assert.equal(parseRepo('https://github.com/'), null);
});

test('imports keep their true line numbers and skip comments', () => {
  const js = `/* import x from './no'\n*/\nimport a from './a';\n// import b from './b'\nconst c = require('./c');\nexport * from "./d";`;
  assert.deepEqual(importsOf(js, 'js'), [{ spec: './a', line: 3, names: ['a'] }, { spec: './c', line: 5 }, { spec: './d', line: 6 }]);
  // Named imports keep the exported name, not the local alias; types are dropped from the clause.
  assert.deepEqual(importsOf("import Def, { run as go, type T, Job } from './q';", 'js')[0].names, ['run', 'T', 'Job', 'Def']);
  const py = `"""\nimport fake\n"""\nfrom .models import User, Post\nimport os, sys as s\n`;
  assert.deepEqual(importsOf(py, 'py'), [{ spec: '.models', line: 4, names: ['User', 'Post'] }, { spec: 'os', line: 5 }, { spec: 'sys', line: 5 }]);
  const go = `package main\n\nimport (\n\t"fmt"\n\t"example.com/m/pkg/util"\n)\n`;
  assert.deepEqual(importsOf(go, 'go'), [{ spec: 'fmt', line: 4 }, { spec: 'example.com/m/pkg/util', line: 5 }]);
});

test('symbols: kind, line and visibility', () => {
  assert.deepEqual(symbolsOf('export const f = () => 1;\nclass A {}\n  function nested() {}\nexport type T = 1;', 'js').map(s => [s.name, s.kind, s.line, s.exported]),
    [['f', 'function', 1, true], ['A', 'class', 2, false], ['T', 'type', 4, true]]);
  assert.deepEqual(symbolsOf('def run():\n    pass\nclass _Hidden:\n    pass', 'py').map(s => [s.name, s.exported]), [['run', true], ['_Hidden', false]]);
});

test('resolve only links to files that exist', () => {
  const all = new Set(['src/a.ts', 'src/lib/index.ts', 'pkg/models.py', 'pkg/__init__.py', 'src/b.js']);
  assert.equal(resolve('src/a.ts', { spec: './lib' }, 'js', all), 'src/lib/index.ts');
  assert.equal(resolve('src/a.ts', { spec: './b.js' }, 'js', all), 'src/b.js');
  assert.equal(resolve('src/a.ts', { spec: './missing' }, 'js', all), null);
  assert.equal(resolve('src/a.ts', { spec: '@/lib' }, 'js', all, { alias: aliasesFrom('{"compilerOptions":{"paths":{"@/*":["src/*"]}}}') }), 'src/lib/index.ts');
  assert.equal(resolve('pkg/views.py', { spec: '.models', names: ['User'] }, 'py', all), 'pkg/models.py');
  assert.equal(resolve('pkg/views.py', { spec: 'pkg', names: ['models'] }, 'py', all), 'pkg/models.py');
});

test('cycles and blast radius follow the edges exactly', () => {
  const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'b' }, { from: 'd', to: 'a' }];
  assert.equal(cycles(['a', 'b', 'c', 'd'], edges).length, 1);
  assert.deepEqual(cycles(['a', 'b', 'c', 'd'], edges)[0], { loop: ['b', 'c'], size: 2, members: ['b', 'c'] });
  // A loop is reported in import order, and only through real edges.
  const big = [{ from: 'x', to: 'y' }, { from: 'y', to: 'z' }, { from: 'z', to: 'x' }, { from: 'y', to: 'w' }, { from: 'w', to: 'y' }];
  const [c] = cycles(['x', 'y', 'z', 'w'], big);
  assert.equal(c.size, 4);
  for (let i = 0; i < c.loop.length; i++) assert.ok(big.some(e => e.from === c.loop[i] && e.to === c.loop[(i + 1) % c.loop.length]), 'each step is an import');
  // Who can feel a change to c: b directly, then a (through b), then d (through a).
  assert.deepEqual(Object.fromEntries(blastRadius('c', edges)), { b: 1, a: 2, d: 3 });
  assert.equal(blastRadius('c', edges).has('c'), false);
  assert.deepEqual(pathBetween('d', 'c', edges), ['d', 'a', 'b', 'c']);
  assert.equal(pathBetween('c', 'd', edges), null);
});

test('pickFiles prefers source over tests and skips vendored code', () => {
  const tree = [
    { path: 'node_modules/x/index.js', type: 'blob', size: 10 }, { path: 'test/a.test.js', type: 'blob', size: 10 },
    { path: 'src/deep/er/x.ts', type: 'blob', size: 10 }, { path: 'index.js', type: 'blob', size: 10 }, { path: 'dist/out.js', type: 'blob', size: 10 },
  ];
  assert.deepEqual(pickFiles(tree), ['index.js', 'src/deep/er/x.ts', 'test/a.test.js']);
});

test('pages: routes come from the files that define them, dynamic ones are skipped', () => {
  const paths = ['app/page.tsx', 'app/about/page.tsx', 'app/(marketing)/pricing/page.tsx', 'app/blog/[slug]/page.tsx', 'app/api/x/route.ts',
    'pages/_app.tsx', 'pages/docs/index.mdx', 'pages/api/hello.ts', 'src/routes/contact/+page.svelte', 'index.html', '404.html', 'node_modules/x/app/page.tsx',
    'src/pages/404.astro', 'src/pages/de/support.astro', 'src/pages/pt-br/support.astro'];
  const texts = { 'src/App.tsx': '<Route path="/settings" element={<S/>} />\n<Route path="/user/:id" />' };
  assert.deepEqual(routesOf(paths, texts).map(r => [r.route, r.file]), [
    ['/', 'app/page.tsx'], ['/docs', 'pages/docs/index.mdx'], ['/about', 'app/about/page.tsx'], ['/contact', 'src/routes/contact/+page.svelte'],
    ['/pricing', 'app/(marketing)/pricing/page.tsx'], ['/settings', 'src/App.tsx'],
  ]);
  assert.equal(headingOf('<main>\n  <h1 className="x">Ship faster</h1>'), 'Ship faster');
  assert.equal(headingOf('# Getting started\ntext'), 'Getting started');
  assert.equal(headingOf('export default () => <div/>'), null);
  assert.equal(liveUrl({ homepage: 'https://ky.dev', owner: 'a', name: 'b' }), 'https://ky.dev/');
  assert.equal(liveUrl({ homepage: 'https://github.com/a/b', owner: 'a', name: 'b', hasPages: true }), 'https://a.github.io/b/');
  assert.equal(liveUrl({ homepage: null, owner: 'a', name: 'a.github.io', hasPages: true }), 'https://a.github.io/');
  assert.equal(liveUrl({ homepage: '', owner: 'a', name: 'b' }), null);
  assert.equal(liveUrl({ homepage: '', owner: 'a', name: 'b', readme: '[![ci](https://img.shields.io/x.svg)](https://github.com/a/b)\nSee the [live demo](https://b.example.com/app?ref=gh).' }), 'https://b.example.com/app/');
  assert.equal(liveUrl({ homepage: '', owner: 'a', name: 'b', readme: 'Deployed at https://b-a.vercel.app.' }), 'https://b-a.vercel.app/');
  // A "*/" inside a string is not the end of a comment.
  assert.deepEqual(aliasesFrom('{ /* c */ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./*"] } }, // x\n "include": ["**/*.ts"] }'), [['@', '']]);
});

test('components get readable names and a kind from their path', () => {
  assert.equal(nameOf('src/jobQueue.ts'), 'Job queue');
  assert.equal(nameOf('src/server/index.ts'), 'Server');
  assert.equal(nameOf('app/blog/page.tsx'), 'Blog page');
  assert.equal(nameOf('lib/api_client.py'), 'API client');
  assert.equal(kindOf('prisma/schema.ts'), 'data');
  assert.equal(kindOf('src/routes/users.ts'), 'api');
  assert.equal(kindOf('src/components/Button.tsx'), 'ui');
  assert.equal(kindOf('src/utils/merge.ts'), 'lib');
});

test('narration is rewritten for the ear, not the eye', () => {
  assert.equal(forEar('The heart is src/core/Ky.ts, then __main__.'), 'The heart is src Ky, then main .');
});

test('stack names come with the manifest that proves them', () => {
  const s = detectStack({ 'package.json': '{"dependencies":{"react":"^19"},"devDependencies":{"vitest":"1"}}', 'requirements.txt': 'flask==3\n' }, ['.github/workflows/ci.yml']);
  assert.deepEqual(s.map(x => [x.name, x.proof]), [['React', 'package.json'], ['Vitest', 'package.json'], ['Flask', 'requirements.txt'], ['GitHub Actions', '.github/workflows/ci.yml']]);
});

test('this repository, end to end: every edge resolves, every film claim cites a real line', () => {
  const paths = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n');
  const tree = paths.map(path => ({ path, type: 'blob', size: readFileSync(path).length }));
  const texts = Object.fromEntries(pickFiles(tree).map(p => [p, readFileSync(p, 'utf8')]));
  const manifests = { 'package.json': readFileSync('package.json', 'utf8'), 'tsconfig.json': readFileSync('tsconfig.json', 'utf8') };
  const meta = { name: 'RepoTale', full: 'HarshDubey23/RepoTale', sha: 'abc', description: 'Test.', readmePath: 'README.md' };
  const model = buildModel({ meta, paths, texts, manifests });

  // src/cli.ts imports src/render.ts on a real line.
  const e = model.edges.find(e => e.from === 'src/cli.ts' && e.to === 'src/render.ts');
  assert.ok(e, 'cli imports render');
  assert.match(texts['src/cli.ts'].split('\n')[e.line - 1], /render/);
  for (const ed of model.edges) assert.ok(texts[ed.to] !== undefined && texts[ed.from] !== undefined);
  assert.ok(model.core.length > 0 && model.core[0].importedBy.length >= model.core.at(-1).importedBy.length);
  assert.ok(model.stack.some(s => s.name === 'Playwright'));

  const story = buildStory(model);
  assert.equal(story[0].kind, 'title');
  assert.equal(story.at(-1).kind, 'end');
  for (const s of story) {
    assert.ok(s.say.length > 10 && s.duration >= 4200);
    for (const ev of s.evidence) {
      assert.ok(paths.includes(ev.file), `${ev.file} exists`);
      if (ev.line) assert.ok(ev.line <= readFileSync(ev.file, 'utf8').split('\n').length, `${ev.file}:${ev.line} in range`);
      assert.match(ev.url, /^https:\/\/github\.com\/HarshDubey23\/RepoTale\/blob\/abc\//);
    }
  }
  const board = storyboardOf(model, story);
  assert.equal(board.scenes.length, story.length);
  assert.ok(board.scenes.every(s => ['title', 'stats', 'diagram', 'code', 'end'].includes(s.type) && s.say));
  assert.match(mermaidOf(model), /^flowchart LR\n/);

  // The architecture: real files as components, real imports as arrows, each labelled by what it imports.
  const arch = buildArch(model);
  const ids = new Set(arch.nodes.map(n => n.id));
  assert.ok(arch.nodes.length >= 6 && arch.nodes.length <= 24);
  assert.ok(arch.nodes.every(n => paths.includes(n.file) && arch.groups.some(g => g.id === n.group)));
  assert.ok(arch.nodes.some(n => n.heart));
  for (const e of arch.edges.filter(e => !e.external && e.from !== 'actor')) {
    assert.ok(ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  }
  // Arrows are capped and only the strongest carry words; the busiest arrow always does.
  const inner = arch.edges.filter(e => !e.external && e.from !== 'actor');
  assert.ok(inner.length <= 30);
  assert.ok(inner[0].label.length > 0 && inner.slice(16).every(e => e.label === ''));
  // A component almost everything imports wears a badge instead of drawing every arrow into it.
  for (const n of arch.nodes.filter(n => n.usedBy)) assert.ok(!inner.some(e => e.to === n.id));
  // cli.ts imports render.ts for real, so whatever stands for them is connected.
  // Every drawn arrow traces back to a real import from the file it cites.
  for (const e of arch.edges.filter(e => !e.external && e.from !== 'actor')) assert.ok(model.edges.some(m => m.from === e.at && m.line === e.line), `${e.at}:${e.line} is a real import`);
  assert.ok(arch.services.some(s => s.title === 'Headless browser'), 'playwright shows up as a service');
  const mer = mermaidArch(arch);
  assert.ok(mer.startsWith('flowchart TD\n'));
  assert.equal((mer.match(/^  subgraph /gm) ?? []).length, arch.groups.length);
  assert.doesNotMatch(mer, /undefined|NaN/);
});
