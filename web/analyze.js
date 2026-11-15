// Reads a public GitHub repository in the browser and turns it into an evidence graph:
// modules, their top-level symbols, the imports between them, and what that implies
// (core modules, entry points, cycles, blast radius). Nothing is guessed: an edge exists only
// when an import resolves to a file that is really in the tree, and every finding carries the
// file and line it came from. Pure functions are exported so `node --test` can check them.
//
// shortcut: imports and declarations are matched by pattern, not parsed, the same trade-off as
// the CLI's `graph`. Upgrade to tree-sitter (web-tree-sitter) when call graphs are needed.

export const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|vue|svelte)$/;
export const SKIP = /(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|vendor|third_party|__pycache__|\.venv|venv|coverage|target|examples?|fixtures?|testdata|docs?)\/|\.min\.|\.d\.ts$|\.bundle\./;
export const TEST = /(^|\/)(tests?|__tests__|specs?|e2e|test-d|testing)\/|[._-](test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$/;
const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];
const MAX_FILES = 220;
const MAX_BYTES = 160_000;

export const langOf = f => /\.py$/.test(f) ? 'py' : /\.go$/.test(f) ? 'go' : 'js';

/** "owner/name" from anything a person might paste. */
export function parseRepo(input) {
  const s = String(input).trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/(?:tree|blob)\/([^/]+))?/);
  if (!m || m[1] === 'github.com') return null;
  return { owner: m[1], name: m[2], ref: m[3] ?? null };
}

/** Strip comments but keep line count, so line numbers stay true. */
function blank(text, lang) {
  const keepLines = s => s.replace(/[^\n]/g, ' ');
  if (lang === 'py') return text.replace(/("""|''')[\s\S]*?\1/g, keepLines).replace(/#.*$/gm, '');
  return text.replace(/\/\*[\s\S]*?\*\//g, keepLines).replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Import specifiers with the line they appear on. */
export function importsOf(text, lang) {
  const code = blank(text, lang);
  const out = [];
  const lineAt = i => code.slice(0, i).split('\n').length;
  if (lang === 'js') {
    for (const m of code.matchAll(/\b(?:import|export)\s+(?:type\s+)?(?:([\w$*{}\s,]+?)\sfrom\s+)?['"]([^'"\n]+)['"]|\b(?:require|import)\(\s*['"]([^'"\n]+)['"]\s*\)/g)) {
      // The names it brings in, as the other file exports them: `{ a, b as c }` gives a and b.
      const clause = m[1] ?? '';
      const names = [...(clause.match(/\{([^}]*)\}/)?.[1] ?? '').split(',').map(n => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(n => /^[\w$]+$/.test(n)),
        ...(clause.replace(/\{[^}]*\}/, '').match(/^\s*([A-Za-z_$][\w$]*)/) ? [clause.replace(/\{[^}]*\}/, '').trim().split(/[\s,]/)[0]] : [])].filter(n => n && n !== 'type');
      out.push({ spec: (m[2] ?? m[3]).replace(/[?#].*$/, ''), line: lineAt(m.index), ...(names.length ? { names } : {}) });
    }
  } else if (lang === 'py') {
    for (const m of code.matchAll(/^[ \t]*from\s+(\.*[\w.]*)\s+import[ \t]+(\([^)]*\)|[^\n]+)|^[ \t]*import[ \t]+([\w., \t]+)/gm)) {
      const line = lineAt(m.index);
      if (m[3]) for (const p of m[3].split(',')) out.push({ spec: p.trim().split(/\s+as\s+/)[0], line });
      else {
        const names = m[2].replace(/[()\\\n]/g, ' ').split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(n => n && n !== '*');
        out.push({ spec: m[1], line, names });
      }
    }
  } else if (lang === 'go') {
    for (const m of code.matchAll(/^import\s*(?:\(([\s\S]*?)\)|(?:\w+\s+)?"([^"]+)")/gm)) {
      const line = lineAt(m.index);
      if (m[2]) out.push({ spec: m[2], line });
      else for (const q of m[1].matchAll(/"([^"]+)"/g)) out.push({ spec: q[1], line: line + m[1].slice(0, q.index).split('\n').length - 1 });
    }
  }
  return out;
}

/** Top-level declarations: name, kind, line. Must start in column 0. */
export function symbolsOf(text, lang) {
  const out = [];
  text.split('\n').forEach((l, i) => {
    let m;
    if (lang === 'py') {
      if ((m = l.match(/^(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/))) out.push({ name: m[2], kind: m[1] === 'def' ? 'function' : 'class', line: i + 1, exported: !m[2].startsWith('_') });
    } else if (lang === 'go') {
      if ((m = l.match(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/))) out.push({ name: m[1], kind: 'function', line: i + 1, exported: /^[A-Z]/.test(m[1]) });
      else if ((m = l.match(/^type\s+([A-Za-z_]\w*)\s+(struct|interface)?/))) out.push({ name: m[1], kind: m[2] === 'struct' ? 'class' : 'type', line: i + 1, exported: /^[A-Z]/.test(m[1]) });
    } else if ((m = l.match(/^(export\s+(?:default\s+)?)?(?:declare\s+)?(async\s+function\*?|function\*?|(?:abstract\s+)?class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/))) {
      const w = m[2];
      const kind = /function/.test(w) || (/const|let/.test(w) && /=\s*(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*(:[^=]+)?=>|=\s*(async\s+)?function\b/.test(l)) ? 'function'
        : /class/.test(w) ? 'class' : /interface|type|enum/.test(w) ? 'type' : 'const';
      out.push({ name: m[3], kind, line: i + 1, exported: !!m[1] });
    }
  });
  return out;
}

const norm = p => {
  const out = [];
  for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); }
  return out.join('/');
};
const dir = f => f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';

/** Resolve one import to a file in `all` (a Set of every path in the tree), or null. */
export function resolve(from, imp, lang, all, ctx = {}) {
  const { spec } = imp;
  if (lang === 'js') {
    let base;
    if (spec.startsWith('.')) base = norm(dir(from) + '/' + spec);
    else if (ctx.alias) { for (const [k, v] of ctx.alias) if (spec === k || spec.startsWith(k + '/')) base = norm(v + spec.slice(k.length)); }
    if (base === undefined) return null;
    const stem = base.replace(/\.(js|mjs|cjs|jsx)$/, '');
    const cands = [base, ...JS_EXT.map(e => stem + e), ...JS_EXT.map(e => base + '/index' + e)];
    return cands.find(c => all.has(c)) ?? null;
  }
  if (lang === 'py') {
    const dots = spec.match(/^\.*/)[0].length;
    const mod = spec.slice(dots).replace(/\./g, '/');
    let bases;
    if (dots) { let d = dir(from); for (let i = 1; i < dots; i++) d = dir(d); bases = [d]; }
    else bases = ['', ...(ctx.pyRoots ?? [])];
    for (const b of bases) {
      const p = norm(b + '/' + mod);
      // `from pkg import sub` may name a submodule; prefer it when it exists.
      for (const n of imp.names ?? []) for (const c of [`${p}/${n}.py`, `${p}/${n}/__init__.py`]) if (all.has(c)) return c;
      for (const c of [p + '.py', p + '/__init__.py']) if (p && all.has(c)) return c;
    }
    return null;
  }
  if (lang === 'go' && ctx.goModule && spec.startsWith(ctx.goModule + '/')) {
    const d = spec.slice(ctx.goModule.length + 1);
    return [...all].find(f => dir(f) === d && f.endsWith('.go') && !f.endsWith('_test.go')) ?? null;
  }
  return null;
}

/** Which tsconfig/jsconfig path aliases map where, e.g. "@/" -> "src/". */
export function aliasesFrom(tsconfigText) {
  try {
    // Comments go, but only outside strings: "**/*.ts" holds a "*/" that is not a comment's end.
    const j = JSON.parse(tsconfigText.replace(/("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => str ?? '').replace(/,(\s*[}\]])/g, '$1'));
    const base = (j.compilerOptions?.baseUrl ?? '.').replace(/^\.\/?/, '');
    return Object.entries(j.compilerOptions?.paths ?? {}).map(([k, v]) => [k.replace(/\/\*$/, ''), norm(base + '/' + String(v[0]).replace(/\/\*$/, ''))]);
  } catch { return []; }
}

/** The part of the tree a file belongs to, for grouping: "src/server", "lib", "(root)". */
export function areaOf(file) {
  const parts = file.split('/').slice(0, -1);
  if (!parts.length) return '(root)';
  const deep = /^(src|lib|app|pkg|packages|apps|internal|cmd|source|server|client)$/.test(parts[0]) && parts.length > 1;
  return deep ? parts.slice(0, 2).join('/') : parts[0];
}

/** Strongly connected components with more than one member: real import cycles. */
export function cycles(nodes, edges) {
  const adj = new Map(nodes.map(n => [n, []]));
  for (const e of edges) adj.get(e.from)?.push(e.to);
  let i = 0; const idx = new Map(), low = new Map(), stack = [], on = new Set(), out = [];
  const visit = v => {
    idx.set(v, i); low.set(v, i++); stack.push(v); on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const c = []; let w;
      do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v);
      if (c.length > 1) out.push(c.reverse());
    }
  };
  for (const n of nodes) if (!idx.has(n)) visit(n);
  // Each component as one real loop, in import order: the shortest way from its first member back
  // to itself. Members not on that loop are still tangled in it and follow after.
  return out.map(c => {
    const inC = new Set(c), prev = new Map(), q = [];
    for (const w of adj.get(c[0])) if (inC.has(w) && !prev.has(w)) { prev.set(w, c[0]); q.push(w); }
    while (q.length && !prev.has(c[0])) { const v = q.shift(); for (const w of adj.get(v)) if (inC.has(w) && !prev.has(w)) { prev.set(w, v); q.push(w); } }
    const loop = []; for (let x = prev.get(c[0]); x !== c[0]; x = prev.get(x)) loop.unshift(x);
    loop.unshift(c[0]);
    return { loop, size: c.length, members: c };
  });
}

/** Everything that depends on `file`, directly or through others: what a change could reach. */
export function blastRadius(file, edges) {
  const rev = new Map();
  for (const e of edges) (rev.get(e.to) ?? rev.set(e.to, []).get(e.to)).push(e.from);
  const seen = new Map([[file, 0]]); const q = [file];
  while (q.length) { const f = q.shift(); for (const g of rev.get(f) ?? []) if (!seen.has(g)) { seen.set(g, seen.get(f) + 1); q.push(g); } }
  seen.delete(file);
  return seen; // file -> hops
}

/** Build the whole model from already-fetched texts. `texts` maps path -> source. */
export function buildModel({ meta, paths, texts, manifests }) {
  const all = new Set(paths);
  const ctx = {
    alias: [...aliasesFrom(manifests['tsconfig.json'] ?? ''), ...aliasesFrom(manifests['jsconfig.json'] ?? '')],
    goModule: manifests['go.mod']?.match(/^module\s+(\S+)/m)?.[1],
    pyRoots: [...new Set(paths.filter(p => /^(src|lib)\/[^/]+\/__init__\.py$/.test(p)).map(p => p.split('/')[0]))],
  };
  const modules = [], edges = [];
  for (const [file, text] of Object.entries(texts)) {
    const lang = langOf(file);
    const imps = importsOf(text, lang);
    const m = { file, lang, area: areaOf(file), lines: text.split('\n').length, test: TEST.test(file), symbols: symbolsOf(text, lang), external: [], imports: [], text };
    for (const imp of imps) {
      const to = resolve(file, imp, lang, all, ctx);
      if (to && to !== file && texts[to] !== undefined) {
        const e = edges.find(e => e.from === file && e.to === to);
        if (e) e.names = [...new Set([...(e.names ?? []), ...(imp.names ?? [])])];
        else edges.push({ from: file, to, line: imp.line, ...(imp.names?.length ? { names: imp.names } : {}) });
        m.imports.push(to);
      }
      else if (!to && !imp.spec.startsWith('.')) m.external.push(imp.spec.split('/').slice(0, imp.spec.startsWith('@') ? 2 : 1).join('/'));
    }
    modules.push(m);
  }
  const byFile = new Map(modules.map(m => [m.file, m]));
  for (const m of modules) m.importedBy = edges.filter(e => e.to === m.file).map(e => e.from);
  const code = modules.filter(m => !m.test);
  const core = [...code].sort((a, b) => b.importedBy.filter(f => !byFile.get(f).test).length - a.importedBy.filter(f => !byFile.get(f).test).length || b.lines - a.lines).slice(0, 5)
    .filter(m => m.importedBy.length > 0);
  const entries = code.filter(m => !m.importedBy.some(f => !byFile.get(f).test) && m.imports.length > 0)
    .sort((a, b) => b.imports.length - a.imports.length).slice(0, 5);
  const cyc = cycles(modules.map(m => m.file), edges);
  // Tests that reach a file through imports, directly or not.
  const testsReaching = file => [...blastRadius(file, edges).keys()].filter(f => byFile.get(f)?.test);
  const ext = new Map();
  for (const m of code) for (const e of new Set(m.external)) ext.set(e, (ext.get(e) ?? 0) + 1);
  splitDominant(modules);
  const areas = groupAreas(modules, edges);
  return {
    meta, modules, edges, areas, core, entries, cycles: cyc, testsReaching,
    external: [...ext].sort((a, b) => b[1] - a[1]),
    // A project is not part of its own stack (flask's pyproject names flask).
    stack: detectStack(manifests, paths).filter(s => s.name.toLowerCase() !== String(meta?.name).toLowerCase()),
    totals: {
      files: paths.length, code: code.length, tests: modules.length - code.length,
      lines: code.reduce((s, m) => s + m.lines, 0), symbols: code.reduce((s, m) => s + m.symbols.length, 0), edges: edges.length,
      languages: languages(paths),
    },
  };
}

/** When most of the code sits in one area (src/flask), split it by its subfolders so the map has
 *  parts to show. Files directly in the area keep its name. */
export function splitDominant(modules) {
  const code = modules.filter(m => !m.test);
  const count = new Map();
  for (const m of code) count.set(m.area, (count.get(m.area) ?? 0) + 1);
  for (const [area, n] of count) {
    if (n < code.length * 0.4 || n < 8) continue;
    const prefix = area === '(root)' ? '' : area + '/';
    for (const m of modules) if (m.area === area) {
      const rest = m.file.slice(prefix.length).split('/');
      if (rest.length > 1) m.area = prefix + rest[0];
    }
  }
}

/** Areas ordered left-to-right by dependency: callers first, foundations last. */
export function groupAreas(modules, edges) {
  const area = new Map(modules.map(m => [m.file, m.area]));
  const names = [...new Set(modules.map(m => m.area))];
  const links = new Map();
  for (const e of edges) {
    const a = area.get(e.from), b = area.get(e.to);
    if (a !== b) links.set(a + '\u0000' + b, (links.get(a + '\u0000' + b) ?? 0) + 1);
  }
  // Longest path rank over the area graph, ignoring back edges so cycles cannot loop.
  const rank = new Map(names.map(n => [n, 0]));
  for (let pass = 0; pass < names.length; pass++) {
    let moved = false;
    for (const [k] of links) {
      const [a, b] = k.split('\u0000');
      if (links.has(b + '\u0000' + a) && a > b) continue;
      if (rank.get(b) < rank.get(a) + 1 && rank.get(a) + 1 < names.length) { rank.set(b, rank.get(a) + 1); moved = true; }
    }
    if (!moved) break;
  }
  return names.map(n => ({ name: n, rank: rank.get(n), files: modules.filter(m => m.area === n).map(m => m.file), tests: modules.filter(m => m.area === n && m.test).length }))
    .sort((a, b) => a.rank - b.rank || b.files.length - a.files.length)
    .map(a => ({ ...a, out: [...links].filter(([k]) => k.startsWith(a.name + '\u0000')).map(([k, w]) => ({ to: k.split('\u0000')[1], weight: w })) }));
}

export function languages(paths) {
  const L = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', cs: 'C#', cpp: 'C++', c: 'C', swift: 'Swift', vue: 'Vue', svelte: 'Svelte', css: 'CSS', scss: 'CSS', html: 'HTML' };
  const n = new Map();
  for (const p of paths) { if (SKIP.test(p)) continue; const l = L[p.split('.').pop()]; if (l) n.set(l, (n.get(l) ?? 0) + 1); }
  return [...n].sort((a, b) => b[1] - a[1]);
}

/** Named frameworks and tools, each with the manifest that proves it. */
export function detectStack(manifests, paths) {
  const found = [];
  const pkg = (() => { try { return JSON.parse(manifests['package.json'] ?? ''); } catch { return null; } })();
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies, ...pkg?.peerDependencies };
  const KNOWN = { next: 'Next.js', react: 'React', vue: 'Vue', svelte: 'Svelte', '@sveltejs/kit': 'SvelteKit', astro: 'Astro', express: 'Express', fastify: 'Fastify', hono: 'Hono', '@nestjs/core': 'NestJS', vite: 'Vite', webpack: 'webpack', typescript: 'TypeScript', tailwindcss: 'Tailwind', prisma: 'Prisma', 'drizzle-orm': 'Drizzle', mongoose: 'Mongoose', 'socket.io': 'Socket.IO', electron: 'Electron', 'react-native': 'React Native', vitest: 'Vitest', jest: 'Jest', mocha: 'Mocha', playwright: 'Playwright', '@playwright/test': 'Playwright', 'three': 'three.js', '@anthropic-ai/sdk': 'Claude API', openai: 'OpenAI API', graphql: 'GraphQL', zod: 'Zod', 'd3': 'D3', redux: 'Redux', '@tanstack/react-query': 'TanStack Query' };
  for (const [k, v] of Object.entries(KNOWN)) if (deps[k]) found.push({ name: v, proof: 'package.json', detail: `${k} ${deps[k]}` });
  const py = (manifests['requirements.txt'] ?? '') + '\n' + (manifests['pyproject.toml'] ?? '');
  const PY = { django: 'Django', flask: 'Flask', fastapi: 'FastAPI', torch: 'PyTorch', tensorflow: 'TensorFlow', numpy: 'NumPy', pandas: 'pandas', pytest: 'pytest', sqlalchemy: 'SQLAlchemy', pydantic: 'Pydantic', transformers: 'Transformers', langchain: 'LangChain', anthropic: 'Claude API', openai: 'OpenAI API', click: 'Click', typer: 'Typer', streamlit: 'Streamlit', werkzeug: 'Werkzeug', jinja2: 'Jinja' };
  for (const [k, v] of Object.entries(PY)) if (new RegExp(`(^|[\\s"'\\[,])${k}([\\s<>=~!;\\[,"']|$)`, 'im').test(py)) found.push({ name: v, proof: manifests['requirements.txt']?.match(new RegExp(k, 'i')) ? 'requirements.txt' : 'pyproject.toml', detail: k });
  if (manifests['go.mod']) found.push({ name: 'Go modules', proof: 'go.mod', detail: manifests['go.mod'].match(/^go\s+(\S+)/m)?.[0] ?? 'go.mod' });
  if (paths.includes('Cargo.toml')) found.push({ name: 'Rust / Cargo', proof: 'Cargo.toml', detail: 'Cargo.toml' });
  if (paths.some(p => /(^|\/)Dockerfile$/.test(p))) found.push({ name: 'Docker', proof: paths.find(p => /(^|\/)Dockerfile$/.test(p)), detail: 'Dockerfile' });
  if (paths.some(p => p.startsWith('.github/workflows/'))) found.push({ name: 'GitHub Actions', proof: paths.find(p => p.startsWith('.github/workflows/')), detail: 'CI workflow' });
  const seen = new Set();
  return found.filter(f => !seen.has(f.name) && seen.add(f.name));
}

/** Which source files to read when a repository has more than we can fetch: prefer non-test code
 *  near the top of the tree, then tests, smallest-first within a tier so many files fit. */
export function pickFiles(tree) {
  const code = tree.filter(t => t.type === 'blob' && CODE.test(t.path) && !SKIP.test(t.path) && (t.size ?? 1) > 0 && (t.size ?? 0) < MAX_BYTES);
  const depth = p => p.split('/').length;
  const score = t => (TEST.test(t.path) ? 1000 : 0) + depth(t.path) * 10 + Math.min(9, (t.size ?? 0) / 8000);
  return code.sort((a, b) => score(a) - score(b)).slice(0, MAX_FILES).map(t => t.path);
}

// ---------------------------------------------------------------- network (browser only)

export class RepoError extends Error {}

async function gh(url, token) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (r.status === 404) throw new RepoError('That repository does not exist or is private. Add a token for private repositories.');
  if (r.status === 403 || r.status === 429) throw new RepoError('GitHub rate limit reached (60 requests an hour without a token). Add a token, or try again in a few minutes.');
  if (!r.ok) throw new RepoError(`GitHub answered ${r.status}.`);
  return r.json();
}

/** Fetch and analyse. `progress(stage, done, total)` is called as work proceeds. */
export async function analyze(input, { token, progress = () => {} } = {}) {
  const repo = parseRepo(input);
  if (!repo) throw new RepoError('Paste a GitHub repository, like owner/name or a github.com link.');
  const api = `https://api.github.com/repos/${repo.owner}/${repo.name}`;
  progress('read', 0, 1);
  const info = await gh(api, token);
  const ref = repo.ref ?? info.default_branch;
  const commit = await gh(`${api}/commits/${encodeURIComponent(ref)}`, token);
  const treeRes = await gh(`${api}/git/trees/${commit.sha}?recursive=1`, token);
  const tree = treeRes.tree;
  const paths = tree.filter(t => t.type === 'blob').map(t => t.path);
  const raw = p => `https://raw.githubusercontent.com/${info.full_name}/${commit.sha}/${p.split('/').map(encodeURIComponent).join('/')}`;
  const get = async p => { try { const r = await fetch(raw(p)); return r.ok ? await r.text() : null; } catch { return null; } };

  const MANIFESTS = ['package.json', 'tsconfig.json', 'jsconfig.json', 'requirements.txt', 'pyproject.toml', 'go.mod'];
  const readme = paths.find(p => /^readme(\.md|\.rst|\.txt)?$/i.test(p));
  const manifests = {};
  await Promise.all([...MANIFESTS.filter(m => paths.includes(m)), readme].filter(Boolean).map(async m => { manifests[m] = await get(m); }));

  const want = pickFiles(tree);
  const texts = {};
  let done = 0;
  progress('fetch', 0, want.length);
  const queue = [...want];
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (queue.length) {
      const p = queue.shift();
      const t = await get(p);
      if (t !== null) texts[p] = t;
      progress('fetch', ++done, want.length);
    }
  }));
  progress('map', 1, 1);
  const meta = {
    owner: info.owner.login, name: info.name, full: info.full_name, description: info.description ?? '',
    stars: info.stargazers_count, forks: info.forks_count, license: info.license?.spdx_id ?? null, homepage: info.homepage || null,
    ref, sha: commit.sha, date: commit.commit?.committer?.date ?? null, url: info.html_url,
    readme: readme ? manifests[readme] : null, readmePath: readme ?? null, truncated: treeRes.truncated || paths.filter(p => CODE.test(p) && !SKIP.test(p)).length > want.length,
    sampled: want.length, hasPages: !!info.has_pages,
  };
  const model = buildModel({ meta, paths, texts, manifests });
  // Pages the code defines; read the few page files not already fetched (.astro, .html, .md) for their headings.
  const routes = routesOf(paths, texts).slice(0, 8);
  await Promise.all(routes.filter(r => texts[r.file] === undefined).map(async r => { texts[r.file] = await get(r.file); }));
  model.pages = routes.map(r => ({ ...r, heading: headingOf(texts[r.file]) }));
  model.live = liveUrl(meta);
  return model;
}

// ---------------------------------------------------------------- the running site

/** Where the project runs, if it says: its homepage, or its GitHub Pages site. */
export function liveUrl(meta) {
  if (meta.homepage && /^https?:\/\//.test(meta.homepage) && !/github\.com\/|npmjs\.com\/|pypi\.org\//.test(meta.homepage)) return meta.homepage.replace(/\/?$/, '/');
  // A demo the README links to: [Live demo](https://...), or a link on a common hosting domain.
  const demo = meta.readme?.match(/\[[^\]]*\b(?:demo|live|preview|website|try it|playground)\b[^\]]*\]\((https?:\/\/[^)\s]+)\)/i)?.[1]
    ?? meta.readme?.match(/https?:\/\/[\w.-]+\.(?:vercel\.app|netlify\.app|pages\.dev|github\.io|onrender\.com|fly\.dev|web\.app|surge\.sh)(?:\/[^\s)"'<>\]]*)?/)?.[0];
  if (demo && !/github\.com\/|shields\.io|badge|\.(png|svg|gif|jpe?g)$/i.test(demo)) return demo.replace(/[#?].*$/, '').replace(/\/?$/, '/');
  if (meta.hasPages) return meta.name.toLowerCase() === `${meta.owner}.github.io`.toLowerCase() ? `https://${meta.name}/` : `https://${meta.owner}.github.io/${meta.name}/`;
  return null;
}

/** Pages the code defines, each with the file that defines it. Dynamic routes ([id], :id) are
 *  skipped: they need real data to show anything. */
export function routesOf(paths, texts = {}) {
  const found = new Map();
  const add = (route, file) => {
    route = ('/' + route).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
    if (/[[:*]/.test(route) || /(^|\/)(404|500|_error|not-found)(\.html)?$/.test(route)) return;
    // The same page in other languages adds nothing: keep English or unprefixed ones.
    if (/^\/(?!en(?:-[a-z]{2})?\/)[a-z]{2}(?:-[a-z]{2})?(\/|$)/i.test(route)) return;
    if (!found.has(route)) found.set(route, file);
  };
  const clean = segs => segs.filter(s => !/^\(.*\)$/.test(s) && !s.startsWith('@')).join('/');
  for (const p of paths) {
    if (SKIP.test(p) && !/(^|\/)(app|pages|routes)\//.test(p)) continue;
    if (/(^|\/)node_modules\//.test(p) || TEST.test(p)) continue;
    let m;
    if ((m = p.match(/(?:^|\/)app\/((?:[^/]+\/)*)page\.(tsx|jsx|ts|js|mdx)$/))) add(clean(m[1].split('/')), p);
    else if ((m = p.match(/(?:^|\/)src\/routes\/((?:[^/]+\/)*)\+page\.svelte$/))) add(clean(m[1].split('/')), p);
    else if ((m = p.match(/(?:^|\/)pages\/(.+)\.(tsx|jsx|js|mdx|md|vue|astro)$/)) && !/(^|\/)(_[^/]*|api\/.*)$/.test(m[1])) add(m[1].replace(/(^|\/)index$/, ''), p);
    else if ((m = p.match(/^(?:public\/|docs\/|site\/)?([^/]+)\.html$/)) && !/^(404|500)$/.test(m[1])) add(m[1] === 'index' ? '' : m[1] + '.html', p);
  }
  // Client-side routers: <Route path="/x"> and { path: '/x' }.
  for (const [file, text] of Object.entries(texts))
    for (const m of text.matchAll(/\bpath\s*[=:]\s*\{?\s*["'`](\/[\w\-/.]*)["'`]/g)) add(m[1], file);
  return [...found].map(([route, file]) => ({ route, file })).sort((a, b) => a.route.length - b.route.length || a.route.localeCompare(b.route));
}

/** The first heading a page file declares, for the narration. */
export function headingOf(text) {
  const m = text?.match(/<h1[^>]*>\s*([^<{}\n]{3,80}?)\s*</i) ?? text?.match(/^#\s+(.{3,80})$/m) ?? text?.match(/\btitle\s*[:=]\s*["'`]([^"'`\n]{3,80})["'`]/) ?? text?.match(/<title>([^<]{3,80})<\/title>/i);
  return m ? m[1].trim() : null;
}

/** A screenshot of one page, as an image the canvas may record (the service sends CORS headers).
 *  shortcut: thum.io's free tier, unauthenticated. If it throttles, add a key or self-host Playwright. */
export function shot(url, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => reject(new Error('screenshot timed out')), timeout);
    img.onload = () => { clearTimeout(t); img.naturalWidth > 200 && !looksEmpty(img) ? resolve(img) : reject(new Error('the page looks empty')); };
    img.onerror = () => { clearTimeout(t); reject(new Error('screenshot failed')); };
    // The free tier caps shots at 1200 by 1200; taller crops come back the same size.
    img.src = `https://image.thum.io/get/width/1280/crop/1200/noanimate/${url}`;
  });
}

/** A blank, transparent or one-line page ("This deployment is paused") is not worth a scene:
 *  fewer than 2% of its pixels differ from its background. */
function looksEmpty(img) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 96;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 96, 96);
  const d = x.getImageData(0, 0, 96, 96).data, n = d.length / 4;
  let alpha = 0; for (let i = 3; i < d.length; i += 4) alpha += d[i];
  if (alpha / n < 128) return true;
  const [r, g, b] = [d[0], d[1], d[2]];
  let differ = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b) > 48) differ++;
  return differ / n < 0.02;
}

/** A permalink to the exact lines, pinned to the analysed commit so it never drifts. */
export const permalink = (meta, file, line, end) => `https://github.com/${meta.full}/blob/${meta.sha}/${file}${line ? `#L${line}${end && end !== line ? `-L${end}` : ''}` : ''}`;
