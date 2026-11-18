// The browser engine behind the website, checked on hand-made trees and on this repository itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { subpathTarget } from '../web/analyze.js';
import { parseRepo, importsOf, symbolsOf, resolve, buildModel, cycles, blastRadius, aliasesFrom, pickFiles, detectStack, routesOf, headingOf, liveUrl, pageFacts, siteLinks, fromUngh } from '../web/analyze.js';
import { forEar } from '../web/voice.js';
import { buildArch, overviewArch, focusArch, mermaidArch, nameOf, kindOf, areaNames } from '../web/arch.js';

test('subsystems are named by their own folder, with the parent only when two would clash', () => {
  const n = areaNames(['apps/api', 'apps/api/market', 'apps/api/gateway', 'web/components', 'mobile/components', 'src', 'source/utils', '(root)']);
  assert.deepEqual(Object.fromEntries(n), {
    'apps/api': 'API', 'apps/api/market': 'Market', 'apps/api/gateway': 'Gateway',
    'web/components': 'Web components', 'mobile/components': 'Mobile components',
    src: 'Src', 'source/utils': 'Utils', '(root)': 'Project root',
  });
  // Every name is distinct, so no two cards on a diagram read the same.
  assert.equal(new Set(n.values()).size, n.size);
});
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
  assert.deepEqual(importsOf(py, 'py'), [{ spec: '.models', line: 4, names: ['User'] }, { spec: '.models', line: 4, names: ['Post'] }, { spec: 'os', line: 5 }, { spec: 'sys', line: 5 }]);
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
  // A bin script importing the compiled build lands on the source it came from, and only if it exists.
  assert.equal(resolve('bin/cli.js', { spec: '../dist/a.js' }, 'js', all), 'src/a.ts');
  assert.equal(resolve('bin/cli.js', { spec: '../dist/missing.js' }, 'js', all), null);
  assert.equal(resolve('bin/cli.js', { spec: '../dist/lib' }, 'js', new Set([...all, 'dist/lib/index.js'])), 'dist/lib/index.js', 'a real dist file wins');
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

test('pickFiles leaves out docs examples and demos, so they cannot crowd out the product (FastAPI)', () => {
  // FastAPI's docs_src holds thousands of tiny tutorial apps, all shallower than the package itself:
  // they used to fill the 220-file budget and become nine of ten subsystems on the map.
  const tree = [
    ...Array.from({ length: 300 }, (_, i) => ({ path: `docs_src/t${i}.py`, type: 'blob', size: 10 })),
    ...['samples/a.py', 'demos/b.js', 'playground/c.ts'].map(path => ({ path, type: 'blob', size: 10 })),
    { path: 'fastapi/applications.py', type: 'blob', size: 9000 }, { path: 'fastapi/routing/core.py', type: 'blob', size: 9000 },
  ];
  assert.deepEqual(pickFiles(tree), ['fastapi/applications.py', 'fastapi/routing/core.py']);
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

test('a live page is read for its headline, its sections and its first sentence, not its menus', () => {
  const md = `Title: Express - Node.js web framework

URL Source: https://x

Markdown Content:
[Skip](https://x)
## Main menu
### Guide
# Fast, **minimalist** web framework
Express is a [minimal](https://x) and flexible Node.js framework for web and mobile applications.
## Clarity over complexity. For every developer.
## Getting started
## Routing
## Middleware
`;
  assert.deepEqual(pageFacts(md), { title: 'Express - Node.js web framework', h1: 'Fast, minimalist web framework', sections: ['Getting started', 'Routing', 'Middleware'],
    lead: 'Express is a minimal and flexible Node.js framework for web and mobile applications.', points: [], links: ['https://x', 'https://x'] });
  assert.deepEqual(pageFacts('Markdown Content:\nnothing here'), { title: null, h1: null, sections: [], lead: null, points: [], links: [] });
});

test('a website is walked through its own pages only, never its sign-out or its files', () => {
  assert.deepEqual(siteLinks('https://site.test/', ['https://site.test/', 'https://site.test/pricing', 'https://site.test/pricing#faq', 'https://other.test/', 'https://site.test/logout', 'https://site.test/brochure.pdf', 'https://site.test/docs/']),
    ['https://site.test/pricing', 'https://site.test/docs']);
  const md = 'Markdown Content:\n# Plans\n- [Home](https://site.test/)\n- [![Image 4: Partner logo](https://a/b.png)](https://partner.test/)\n- Unlimited projects for every team member\n- ok\n';
  assert.deepEqual(pageFacts(md).points, ['Unlimited projects for every team member']);
});

test('when GitHub runs out of calls, ungh answers are reshaped into the same model', () => {
  const r = fromUngh({ repo: 'a/b', description: 'd', stars: 5, forks: 1, defaultBranch: 'main', pushedAt: '2026-01-01T00:00:00Z' }, 'main',
    { meta: { sha: 'abc123' }, files: [{ path: 'src/x.ts', size: 10 }] });
  assert.equal(r.info.full_name, 'a/b'); assert.equal(r.info.owner.login, 'a'); assert.equal(r.info.stargazers_count, 5);
  assert.equal(r.commit.sha, 'abc123');
  assert.deepEqual(r.treeRes.tree, [{ path: 'src/x.ts', type: 'blob', size: 10 }]);
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

  // The overview: one box per subsystem; an arrow's count is exactly the real imports between the
  // two subsystems, both directions together when it has two heads.
  const ov = overviewArch(model, arch);
  const areaOf = new Map(model.modules.map(m => [m.file, m.area]));
  // Every subsystem is drawn, except a one-file folder with no imports either way (bin/ here).
  const code = model.modules.filter(m => !m.test);
  for (const g of arch.groups) {
    const drawn = ov.nodes.some(n => n.area === g.area), files = code.filter(m => m.area === g.area);
    const linked = model.edges.some(e => (areaOf.get(e.from) === g.area) !== (areaOf.get(e.to) === g.area) && code.some(m => m.file === e.from) && code.some(m => m.file === e.to));
    assert.equal(drawn, linked || files.length > 1, g.area);
  }
  assert.ok(!ov.nodes.some(n => n.area === 'bin'));
  const real = (a: string, b: string) => model.edges.filter(e => !model.modules.find(m => m.file === e.from)?.test && !model.modules.find(m => m.file === e.to)?.test
    && areaOf.get(e.from) === a && areaOf.get(e.to) === b).length;
  const byId = new Map(ov.nodes.map(n => [n.id, n]));
  const ovInner = ov.edges.filter(e => !e.external && e.from !== 'actor');
  assert.ok(ovInner.length > 0 && ovInner.length <= 9);
  for (const e of ovInner) {
    const a = byId.get(e.from).area, b = byId.get(e.to).area;
    assert.notEqual(a, b);
    assert.equal(e.count, real(a, b) + (e.both ? real(b, a) : 0), `${a} -> ${b}`);
    assert.equal(e.both, real(b, a) > 0);
    assert.ok(e.count >= real(b, a), 'an arrow points the heavier way');
  }
  assert.doesNotMatch(mermaidArch(ov), /undefined|NaN/);

  // A subsystem opened: its own busiest files, its neighbours as single boxes joined to the
  // subsystem as a whole, and no arrow between two neighbours.
  const src = arch.groups.find(g => g.area === 'src');
  const f = focusArch(model, arch, 'src');
  const files = f.nodes.filter(n => n.file);
  assert.ok(files.length > 0 && files.length <= 14 && files.every(n => areaOf.get(n.file) === 'src'));
  const nbr = new Set(f.nodes.filter(n => n.neighbour).map(n => n.id));
  assert.ok(nbr.size > 0 && [...nbr].every(id => id.startsWith('a:') && id !== 'a:src'));
  for (const e of f.edges.filter(e => !e.external)) {
    assert.ok(!(nbr.has(e.from) && nbr.has(e.to)), 'no neighbour-to-neighbour arrow');
    if (nbr.has(e.from)) assert.equal(e.to, src.id);
    if (nbr.has(e.to)) assert.equal(e.from, src.id);
    if (nbr.has(e.from)) assert.equal(e.count, real(e.from.slice(2), 'src'));
  }
});

// Each case below was a wrong answer against bench/truth.json before it was fixed.
test('from a package import several submodules: each is an import (requests __init__ -> utils was missed)', () => {
  const texts = { 'pkg/__init__.py': 'from . import a, b\nfrom .c import thing\n', 'pkg/a.py': '', 'pkg/b.py': '', 'pkg/c.py': 'thing = 1\n' };
  const m = buildModel({ meta: { name: 'x', full: 'a/x', truncated: false }, paths: Object.keys(texts), texts, manifests: {} });
  assert.deepEqual(m.modules.find((x: any) => x.file === 'pkg/__init__.py').imports.sort(), ['pkg/a.py', 'pkg/b.py', 'pkg/c.py']);
});

test('package.json imports (#name) resolve to the repository file, never to a package called ""', () => {
  const texts = { 'source/index.js': "import a from '#ansi';\nimport s from '#supports';\nimport x from '#missing';\nimport css from './a.css?inline';\n", 'source/vendored/ansi.js': '', 'source/vendored/sc.js': '', 'source/vendored/sc-browser.js': '' };
  const pkg = JSON.stringify({ imports: { '#ansi': './source/vendored/ansi.js', '#supports': { node: './source/vendored/sc.js', default: './source/vendored/sc-browser.js' } } });
  const m = buildModel({ meta: { name: 'x', full: 'a/x', truncated: false }, paths: [...Object.keys(texts), 'source/a.css'], texts, manifests: { 'package.json': pkg } });
  const idx = m.modules.find((x: any) => x.file === 'source/index.js');
  assert.deepEqual(idx.imports.sort(), ['source/vendored/ansi.js', 'source/vendored/sc.js']);
  assert.deepEqual(idx.external, [], 'no empty or #-named package');
  assert.equal(subpathTarget({ '#n': { browser: './b.js', node: { import: './n.mjs' } } }, '#n'), 'n.mjs');
});
