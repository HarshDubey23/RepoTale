// `reporeel graph` also writes explore.html: one self-contained page to walk the import graph.
// Pick a module and see who imports it, what it imports, its symbols and the tests that reach it.
// File and symbol names come from the repository, so the page only ever sets them as text.
import type { Graph } from './graph.ts';

/** `repo` ("owner/name") turns symbols and files into links to the exact commit on GitHub. */
export function explorerHtml(g: Graph, o: { title: string; repo?: string }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  // "<" is escaped so a file name can never close the script element.
  const data = JSON.stringify({ g, repo: o.repo && /^[\w.-]+\/[\w.-]+$/.test(o.repo) ? o.repo : null }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}: code map</title>
<style>
:root{color-scheme:dark light;--bg:#0d1117;--panel:#161b22;--line:#30363d;--text:#e6edf3;--dim:#8b949e;--accent:#ff7a45}
@media (prefers-color-scheme:light){:root{--bg:#fff;--panel:#f6f8fa;--line:#d0d7de;--text:#1f2328;--dim:#59636e;--accent:#bc4c00}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif}
header{padding:16px 20px;border-bottom:1px solid var(--line)}h1{font-size:18px;margin:0}header p{margin:4px 0 0;color:var(--dim);font-size:13px}
main{display:grid;grid-template-columns:280px 1fr;min-height:calc(100vh - 75px)}
nav{border-right:1px solid var(--line);padding:12px;overflow:auto;max-height:calc(100vh - 75px)}
input{width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--text);font:inherit}
button{display:block;width:100%;text-align:left;padding:5px 8px;margin:2px 0;border:0;border-radius:6px;background:none;color:var(--text);font:13px ui-monospace,monospace;cursor:pointer;overflow-wrap:anywhere}
button:hover,button:focus-visible{background:var(--panel);outline:2px solid var(--accent);outline-offset:-2px}button[aria-current]{background:var(--panel);color:var(--accent)}
section{padding:20px;min-width:0}h2{font:600 17px ui-monospace,monospace;margin:0 0 4px;overflow-wrap:anywhere}h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin:0 0 6px}
.cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:16px}.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;min-width:0}
.dim{color:var(--dim);font-size:13px}.tag{font-size:11px;border:1px solid var(--line);border-radius:10px;padding:0 7px;margin-left:6px;color:var(--dim)}
li{font:13px ui-monospace,monospace;margin:3px 0;overflow-wrap:anywhere}ul{list-style:none;margin:0;padding:0}a{color:var(--accent)}
@media (max-width:800px){main{grid-template-columns:1fr}nav{border-right:0;border-bottom:1px solid var(--line);max-height:40vh}.cols{grid-template-columns:1fr}}
</style></head><body>
<header><h1>${esc(o.title)}: code map</h1><p id="sum"></p></header>
<main><nav aria-label="Modules"><input id="q" type="search" placeholder="Filter files and symbols" aria-label="Filter files and symbols"><div id="list"></div></nav><section id="view" aria-live="polite"></section></main>
<script type="application/json" id="data">${data}</script>
<script>
const { g, repo } = JSON.parse(document.getElementById('data').textContent);
const by = Object.fromEntries(g.modules.map(m => [m.file, m]));
const users = f => g.modules.filter(m => m.imports.includes(f)).map(m => m.file);
const el = (tag, text, attrs) => { const e = document.createElement(tag); if (text != null) e.textContent = text; for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };
const link = (file, line) => repo && g.commit ? 'https://github.com/' + repo + '/blob/' + g.commit + '/' + file.split('/').map(encodeURIComponent).join('/') + (line ? '#L' + line : '') : null;
// Tests that reach a file by following imports upward.
const testsFor = f => { const seen = new Set([f]), q = [f]; for (let x; (x = q.shift());) for (const u of users(x)) if (!seen.has(u)) { seen.add(u); q.push(u); } return [...seen].filter(x => by[x].test && x !== f); };
let current = (location.hash && decodeURIComponent(location.hash.slice(1))) || null;
const go = f => { current = f; history.replaceState(null, '', '#' + encodeURIComponent(f)); draw(); };
const pick = f => { const b = el('button', f); b.onclick = () => go(f); return b; };
function card(title, items, make) {
  const c = el('div', null, { class: 'card' }); c.append(el('h3', title + ' (' + items.length + ')'));
  if (!items.length) c.append(el('p', 'none', { class: 'dim' })); else { const ul = el('ul'); for (const i of items) { const li = el('li'); li.append(make(i)); ul.append(li); } c.append(ul); }
  return c;
}
function draw() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const shown = g.modules.filter(m => !q || m.file.toLowerCase().includes(q) || g.symbols.some(s => s.file === m.file && s.name.toLowerCase().includes(q)));
  const list = document.getElementById('list'); list.replaceChildren();
  for (const m of shown) { const b = pick(m.file); if (m.file === current) b.setAttribute('aria-current', 'true'); list.append(b); }
  if (!shown.length) list.append(el('p', 'No file or symbol matches.', { class: 'dim' }));
  const view = document.getElementById('view'); view.replaceChildren();
  const m = by[current];
  if (!m) { view.append(el('p', g.modules.length ? 'Pick a module on the left.' : 'No TypeScript, JavaScript or Python files were found.', { class: 'dim' })); return; }
  const h = el('h2', m.file); if (m.test) h.append(el('span', 'test', { class: 'tag' })); view.append(h);
  const meta = el('p', m.lines + ' lines', { class: 'dim' }); const href = link(m.file);
  if (href) { meta.append(' · '); meta.append(el('a', 'source at ' + g.commit.slice(0, 7), { href, rel: 'noopener' })); } view.append(meta);
  const cols = el('div', null, { class: 'cols' });
  cols.append(card('Imported by', users(m.file), pick), card('Imports', m.imports, pick), card('Tests that reach it', testsFor(m.file), pick));
  cols.append(card('Symbols', g.symbols.filter(s => s.file === m.file), s => { const t = s.kind + ' ' + s.name + (s.exported ? '' : ' (private)') + '  :' + s.line; const u = link(s.file, s.line); return u ? el('a', t, { href: u, rel: 'noopener' }) : el('span', t); }));
  cols.append(card('Packages', m.external, x => el('span', x)), card('Imports that resolve to no file', m.unresolved, x => el('span', x)));
  view.append(cols);
}
document.getElementById('sum').textContent = g.modules.length + ' modules, ' + g.symbols.length + ' symbols, ' + g.modules.reduce((n, m) => n + m.imports.length, 0) + ' import edges' + (g.commit ? ' at commit ' + g.commit.slice(0, 7) : '') + '. Edges are imports that resolve to a file; calls are not traced.';
document.getElementById('q').oninput = draw;
if (!by[current]) current = g.modules.slice().sort((a, b) => users(b.file).length - users(a.file).length)[0]?.file ?? null;
draw();
</script></body></html>
`;
}
