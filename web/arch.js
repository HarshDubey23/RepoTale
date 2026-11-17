// The architecture diagram: the components that matter, grouped into subsystems, the outside
// services they call and who uses them, with every arrow labelled by what actually crosses it
// (the names one file imports from the other). Laid out by ELK's layered algorithm with
// orthogonal edges, rendered as one SVG that works on the page, in exports and in the film.
//
// Nothing here is guessed by a model: a component is a real file, an arrow is a real import, a
// service is a package the code imports. Names are made readable, never invented.

const base = f => f.split('/').pop();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const words = s => s.replace(/\.[a-z0-9]+$/i, '').replace(/^[_.+]+|[_.+]+$/g, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_.+\s]+/g, ' ').trim();
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** A readable name for a file: "jobQueue.ts" -> "Job queue", "server/index.ts" -> "Server". */
export function nameOf(file) {
  const parts = file.split('/');
  let w = words(parts.at(-1));
  if (/^(index|main|mod|init|app|page|route|layout|\+page|\+layout|__init__)$/i.test(w.replace(/\s/g, '')) && parts.length > 1) {
    const dir = words(parts.at(-2).replace(/^\(|\)$/g, ''));
    w = /^(index|main|mod|init|__init__)$/i.test(w.replace(/\s/g, '')) ? dir : `${dir} ${w.toLowerCase()}`;
  }
  return cap(w.toLowerCase().replace(/\b(api|ui|url|http|db|sql|id|cli|tts|svg|css|html|json|jwt|sdk|llm|ai)\b/g, m => m.toUpperCase()));
}

/** What kind of part a file is, from its path. Decides the shape it is drawn as. */
export function kindOf(file) {
  const f = file.toLowerCase();
  if (/(^|\/)(db|database|schema|models?|prisma|migrations?|store|repositor(y|ies)|dao|entities)(\/|\.|$)/.test(f)) return 'data';
  if (/(^|\/)(api|routes?|server|handlers?|controllers?|endpoints?|middleware)(\/|\.|$)|route\.(t|j)s$/.test(f)) return 'api';
  if (/(^|\/)(components?|ui|views?|pages|app|screens?|layouts?)(\/|$)|\.(tsx|jsx|vue|svelte|astro)$/.test(f)) return 'ui';
  if (/(^|\/)(config|settings|env|constants?)(\/|\.|$)/.test(f)) return 'config';
  if (/(^|\/)(utils?|helpers?|lib|common|shared)(\/|\.|$)/.test(f)) return 'lib';
  return 'core';
}

// Packages that stand for a service outside the code, and what to call it.
const SERVICES = [
  [/^(pg|postgres|@neondatabase\/serverless|psycopg2?|asyncpg)$/, 'PostgreSQL', 'data'], [/^(@prisma\/client|prisma)$/, 'Database (Prisma)', 'data'],
  [/^(drizzle-orm)$/, 'Database (Drizzle)', 'data'], [/^(mongoose|mongodb|pymongo|motor)$/, 'MongoDB', 'data'], [/^(mysql2?|pymysql)$/, 'MySQL', 'data'],
  [/^(better-sqlite3|sqlite3|sqlite)$/, 'SQLite', 'data'], [/^(redis|ioredis|@upstash\/redis)$/, 'Redis', 'cache'], [/^(sqlalchemy)$/, 'SQL database', 'data'],
  [/^(@supabase\/supabase-js|supabase)$/, 'Supabase', 'cloud'], [/^(firebase|firebase-admin)$/, 'Firebase', 'cloud'], [/^(@aws-sdk\/.+|aws-sdk|boto3)$/, 'AWS', 'cloud'],
  [/^(stripe)$/, 'Stripe API', 'cloud'], [/^(openai)$/, 'OpenAI API', 'cloud'], [/^(@anthropic-ai\/sdk|anthropic)$/, 'Claude API', 'cloud'],
  [/^(@google\/generative-ai|google-generativeai|@google\/genai)$/, 'Gemini API', 'cloud'], [/^(@octokit\/.+|octokit|PyGithub|github)$/, 'GitHub API', 'cloud'],
  [/^(resend|nodemailer|@sendgrid\/mail)$/, 'Email service', 'cloud'], [/^(twilio)$/, 'Twilio', 'cloud'], [/^(@clerk\/.+|next-auth|@auth\/.+|passport)$/, 'Auth provider', 'cloud'],
  [/^(socket\.io|socket\.io-client|ws)$/, 'WebSockets', 'cloud'], [/^(kafkajs|amqplib|bullmq|bull|celery)$/, 'Message queue', 'queue'],
  [/^(playwright|puppeteer|@playwright\/test)$/, 'Headless browser', 'tool'], [/^(ffmpeg-static|fluent-ffmpeg)$/, 'ffmpeg', 'tool'],
  [/^(kokoro-js)$/, 'Kokoro voice', 'tool'], [/^(@elevenlabs\/.+|elevenlabs)$/, 'ElevenLabs API', 'cloud'], [/^(transformers|torch|tensorflow|@huggingface\/.+)$/, 'ML models', 'tool'],
  [/^(langchain|@langchain\/.+)$/, 'LLM chain', 'cloud'], [/^(@vercel\/.+)$/, 'Vercel', 'cloud'], [/^(cloudinary|uploadthing)$/, 'File storage', 'cloud'],
];

// Twelve hues that read on the dark ground, each with a deep tint for its subsystem's field.
const HUES = ['#1f6f4a', '#e5484d', '#12a594', '#f76b15', '#8e4ec6', '#0090ff', '#d6409f', '#46a758', '#ad7f58', '#3e63dd', '#e0a400', '#00a2c7'];

/** Short names for folders: the folder's own name ("apps/api/market" is "Market"), with its parent
 *  added only where two would read the same, and never a bare "src" or "lib". */
export function areaNames(areas) {
  const parts = a => a === '(root)' ? [] : a.split('/').filter(s => !/^(src|lib|source)$/.test(s));
  const say = ps => cap(words(ps.join(' ')).toLowerCase().replace(/\b(api|ui|cli|sdk|db|ai|mcp)\b/g, m => m.toUpperCase()));
  const names = new Map();
  for (const a of areas) {
    const ps = parts(a);
    if (!ps.length) { names.set(a, a === '(root)' ? 'Project root' : say([a.split('/').at(-1)])); continue; }
    let n = 1;
    while (n < ps.length && areas.some(b => b !== a && parts(b).slice(-n).join('/') === ps.slice(-n).join('/'))) n++;
    names.set(a, say(ps.slice(-n)));
  }
  return names;
}

/** Pick the components, group them, and connect them. Pure: no layout, no DOM. */
export function buildArch(model, { max = 24 } = {}) {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const code = model.modules.filter(m => !m.test);
  const entries = new Set(model.entries.map(m => m.file)), core = new Set(model.core.map(m => m.file));
  const score = m => m.importedBy.filter(f => !byFile.get(f)?.test).length * 3 + m.imports.length + (entries.has(m.file) ? 6 : 0) + (core.has(m.file) ? 8 : 0) + Math.min(4, m.lines / 150);
  const ranked = [...code].sort((a, b) => score(b) - score(a));

  // Every area gets its best file first, the biggest areas first; then the rest by score.
  const areas = [...new Set(code.map(m => m.area))].sort((a, b) => code.filter(m => m.area === b).length - code.filter(m => m.area === a).length).slice(0, 10);
  const pick = new Set();
  for (const a of areas) { const top = ranked.find(m => m.area === a); if (top) pick.add(top.file); }
  for (const m of ranked) { if (pick.size >= max) break; if (areas.includes(m.area) && (score(m) > 1 || pick.size < 8)) pick.add(m.file); }
  // A file left out speaks through the busiest chosen file of its area.
  const hub = new Map();
  for (const a of areas) hub.set(a, ranked.find(m => m.area === a && pick.has(m.file))?.file);
  const rep = f => pick.has(f) ? f : hub.get(byFile.get(f)?.area);

  const kept = areas.filter(a => [...pick].some(f => byFile.get(f).area === a)), names = areaNames(kept);
  const groups = kept.map((a, i) => ({
    id: 'g' + i, area: a, label: names.get(a),
    path: a, color: HUES[i % HUES.length], files: code.filter(m => m.area === a).length,
  }));
  const groupOf = new Map(groups.map(g => [g.area, g]));
  const nodes = [...pick].map(f => {
    const m = byFile.get(f);
    return { id: f, file: f, title: nameOf(f), kind: kindOf(f), group: groupOf.get(m.area)?.id, color: groupOf.get(m.area)?.color, lines: m.lines,
      users: m.importedBy.filter(x => !byFile.get(x)?.test).length, entry: entries.has(f), heart: model.core[0]?.file === f };
  }).filter(n => n.group);
  const ids = new Set(nodes.map(n => n.id));

  // Arrows: real imports between the chosen components, merged, labelled with what they import.
  const links = new Map();
  for (const e of model.edges) {
    if (byFile.get(e.from)?.test || byFile.get(e.to)?.test) continue;
    const a = rep(e.from), b = rep(e.to);
    if (!a || !b || a === b || !ids.has(a) || !ids.has(b)) continue;
    const k = a + '\u0000' + b, l = links.get(k) ?? { from: a, to: b, count: 0, names: new Set(), line: e.line, at: e.from };
    l.count++; for (const n of e.names ?? []) l.names.add(n);
    links.set(k, l);
  }
  let edges = [...links.values()].map((l, i) => ({ id: 'e' + i, from: l.from, to: l.to, count: l.count, line: l.line, at: l.at, label: labelOf([...l.names], l.count) }));
  // A component nearly everything imports (shared types, a utils file) would pull an arrow from
  // every box. It wears a "used by N" badge instead, which says the same thing without the tangle.
  const fanIn = new Map(); for (const e of edges) fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  const everywhere = new Set([...fanIn].filter(([, n]) => n >= Math.max(5, nodes.length * 0.35)).map(([id]) => id));
  for (const n of nodes) if (everywhere.has(n.id)) n.usedBy = fanIn.get(n.id);
  edges = edges.filter(e => !everywhere.has(e.to));
  // The strongest arrows stay, and only the strongest of those carry words.
  edges = edges.sort((a, b) => b.count - a.count).slice(0, 30);
  edges.forEach((e, i) => { e.id = 'e' + i; if (i >= 16) e.label = ''; });

  // Outside services, from the packages the chosen components (or the files they speak for) import.
  const services = new Map();
  for (const m of code) {
    const a = rep(m.file); if (!a || !ids.has(a)) continue;
    for (const pkg of new Set(m.external)) {
      const hit = SERVICES.find(([re]) => re.test(pkg)); if (!hit) continue;
      const id = 'svc:' + hit[1];
      const s = services.get(id) ?? { id, title: hit[1], kind: hit[2], pkgs: new Set(), from: new Map() };
      s.pkgs.add(pkg); s.from.set(a, (s.from.get(a) ?? m.file));
      services.set(id, s);
    }
  }
  const svc = [...services.values()].slice(0, 8);
  for (const s of svc) for (const [a, file] of s.from) edges.push({ id: 'e' + edges.length, from: a, to: s.id, count: 1, label: s.kind === 'data' ? 'reads and writes' : s.kind === 'tool' ? 'runs' : 'calls', at: file, external: true });

  // Who starts it: a visitor for sites, someone at a terminal otherwise.
  const site = (model.pages?.length ?? 0) > 0 || model.stack.some(s => /Next\.js|React|Vue|Svelte|SvelteKit|Astro|Nuxt|Vite/.test(s.name));
  const starts = nodes.filter(n => n.entry).sort((a, b) => b.users - a.users).slice(0, 3);
  const actor = starts.length ? { id: 'actor', title: site ? 'Visitor' : 'Developer', kind: 'actor' } : null;
  if (actor) for (const n of starts) edges.push({ id: 'e' + edges.length, from: 'actor', to: n.id, count: 1, label: site ? 'opens' : 'runs' });

  return { groups, nodes, services: svc.map(s => ({ id: s.id, title: s.title, kind: s.kind, pkgs: [...s.pkgs] })), actor, edges, meta: model.meta,
    hidden: code.length - nodes.length };
}

// ---------------------------------------------------------------- levels
// One diagram with every file and arrow is unreadable past a dozen parts. So the map has levels,
// like a street map: the overview shows each subsystem as one box and the imports between two
// subsystems as one arrow (thicker when there are more); opening a subsystem shows its own files,
// with its neighbours folded into single boxes at the edge.

const areaKind = files => {
  const n = {}; for (const f of files) { const k = kindOf(f); n[k] = (n[k] ?? 0) + 1; }
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'core';
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Merge file-level imports into arrows between whatever `key` maps each file to. */
function merge(model, key) {
  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const links = new Map();
  for (const e of model.edges) {
    if (byFile.get(e.from)?.test || byFile.get(e.to)?.test) continue;
    const a = key(e.from), b = key(e.to);
    if (!a || !b || a === b) continue;
    const k = a + '\u0000' + b, l = links.get(k) ?? { from: a, to: b, count: 0, names: new Set(), line: e.line, at: e.from };
    l.count++; for (const n of e.names ?? []) l.names.add(n);
    links.set(k, l);
  }
  return [...links.values()].sort((a, b) => b.count - a.count)
    .map((l, i) => ({ id: 'e' + i, from: l.from, to: l.to, count: l.count, line: l.line, at: l.at, label: labelOf([...l.names], l.count) }));
}

/** Services and who calls them, for the nodes `key` maps files to. */
function servicesFor(model, key, keep = () => true) {
  const services = new Map();
  for (const m of model.modules) {
    if (m.test) continue;
    const a = key(m.file); if (!a || !keep(a)) continue;
    for (const pkg of new Set(m.external)) {
      const hit = SERVICES.find(([re]) => re.test(pkg)); if (!hit) continue;
      const id = 'svc:' + hit[1];
      const s = services.get(id) ?? { id, title: hit[1], kind: hit[2], pkgs: new Set(), from: new Map() };
      s.pkgs.add(pkg); if (!s.from.has(a)) s.from.set(a, m.file);
      services.set(id, s);
    }
  }
  const svc = [...services.values()].slice(0, 6);
  const edges = svc.flatMap(s => [...s.from].map(([a, file]) => ({ from: a, to: s.id, count: 1, label: s.kind === 'data' ? 'reads and writes' : s.kind === 'tool' ? 'runs' : 'calls', at: file, external: true })));
  return { services: svc.map(s => ({ id: s.id, title: s.title, kind: s.kind, pkgs: [...s.pkgs] })), edges };
}

/** The overview: one box per subsystem, one arrow per pair of subsystems that import each other. */
export function overviewArch(model, arch) {
  const code = model.modules.filter(m => !m.test);
  const groupOf = new Map(arch.groups.map(g => [g.area, g]));
  const areaOf = new Map(code.map(m => [m.file, m.area]));
  const key = f => groupOf.has(areaOf.get(f)) ? groupOf.get(areaOf.get(f)).id : null;
  const heart = model.core[0]?.file;
  const nodes = arch.groups.map(g => {
    const files = code.filter(m => m.area === g.area);
    const top = [...files].sort((a, b) => b.importedBy.length - a.importedBy.length).slice(0, 3).map(m => nameOf(m.file));
    return { id: g.id, title: g.label, kind: areaKind(files.map(m => m.file)), group: null, color: g.color, area: g.area,
      sub: `${plural(files.length, 'file')} · ${top.join(', ')}`, users: 0, heart: files.some(m => m.file === heart) };
  });
  // Two subsystems that import each other get one arrow with a head at each end, pointing mainly
  // the heavier way. Only the strongest links are drawn; the words go in the hover text.
  const pairs = new Map();
  for (const e of merge(model, key)) {
    const k = [e.from, e.to].sort().join('\u0000'), p = pairs.get(k);
    if (!p) { pairs.set(k, { ...e, detail: e.label, back: 0 }); continue; }
    if (e.count > p.count) Object.assign(p, { from: e.from, to: e.to, at: e.at, line: e.line, detail: e.label, back: p.count }); else p.back += e.count;
  }
  const strong = [...pairs.values()].sort((a, b) => (b.count + b.back) - (a.count + a.back));
  const total = strong.reduce((s, e) => s + e.count + e.back, 0);
  const edges = strong.filter((e, i) => i < 6 || (e.count + e.back) / total >= 0.06).slice(0, 9);
  // Every subsystem keeps at least its own strongest link, so none floats as if it stood alone.
  for (const e of strong) if (!edges.includes(e) && ![e.from, e.to].every(id => edges.some(x => x.from === id || x.to === id))) edges.push(e);
  for (const e of edges) {
    e.both = e.back > 0; e.count += e.back;
    e.label = e.both ? `${e.count} imports, both ways` : plural(e.count, 'import');
  }
  for (const n of nodes) n.users = edges.filter(e => e.to === n.id).reduce((s, e) => s + e.count, 0);
  // A one-file folder that imports nothing and nothing imports (a bin shim, a bench script) says
  // nothing about the shape; it stays in "Every component".
  const linked = new Set(merge(model, key).flatMap(e => [e.from, e.to]));
  for (let i = nodes.length - 1; i >= 0; i--) if (!linked.has(nodes[i].id) && code.filter(m => m.area === nodes[i].area).length === 1) nodes.splice(i, 1);
  const svc = servicesFor(model, key);
  const all = [...edges, ...svc.edges];
  const starts = [...new Set(model.entries.map(m => key(m.file)).filter(Boolean))].slice(0, 2);
  const actor = starts.length ? { id: 'actor', title: arch.actor?.title ?? 'Developer', kind: 'actor' } : null;
  if (actor) for (const id of starts) all.push({ from: 'actor', to: id, count: 1, label: actor.title === 'Visitor' ? 'opens' : 'runs' });
  all.forEach((e, i) => { e.id = 'e' + i; });
  return { level: 'overview', groups: [], nodes, services: svc.services, actor, edges: all, meta: model.meta, hidden: 0 };
}

/** One subsystem opened: its files (up to `max`), and each neighbouring subsystem as one box. */
export function focusArch(model, arch, area, { max = 14 } = {}) {
  const code = model.modules.filter(m => !m.test);
  const byFile = new Map(code.map(m => [m.file, m]));
  const g = arch.groups.find(x => x.area === area) ?? { id: 'g', area, label: areaNames([area]).get(area), color: HUES[0] };
  const mine = code.filter(m => m.area === area).sort((a, b) => (b.importedBy.length * 3 + b.imports.length) - (a.importedBy.length * 3 + a.imports.length));
  const pick = new Set(mine.slice(0, max).map(m => m.file)), hub = mine[0]?.file;
  const groupOf = new Map(arch.groups.map(x => [x.area, x]));
  const key = f => { const m = byFile.get(f); if (!m) return null; if (m.area === area) return pick.has(f) ? f : hub; return 'a:' + m.area; };
  const entries = new Set(model.entries.map(m => m.file)), heart = model.core[0]?.file;
  const nodes = [...pick].map(f => ({ id: f, file: f, title: nameOf(f), kind: kindOf(f), group: g.id, color: g.color, lines: byFile.get(f).lines,
    users: byFile.get(f).importedBy.length, entry: entries.has(f), heart: f === heart }));
  let edges = merge(model, key);
  // A neighbour connects to the subsystem as a whole: one arrow each way, not one per file, so the
  // inside stays about its own files.
  const outer = new Map();
  for (const e of edges.filter(e => e.from.startsWith('a:') !== e.to.startsWith('a:'))) {
    const from = e.from.startsWith('a:') ? e.from : g.id, to = e.to.startsWith('a:') ? e.to : g.id, k = from + '\u0000' + to;
    const o = outer.get(k) ?? { ...e, from, to, count: 0 };
    o.count += e.count; outer.set(k, o);
  }
  for (const o of outer.values()) o.label = plural(o.count, 'import');
  edges = [...edges.filter(e => !e.from.startsWith('a:') && !e.to.startsWith('a:')), ...outer.values()].sort((a, b) => b.count - a.count);
  const near = [...new Set(edges.flatMap(e => [e.from, e.to]).filter(id => id.startsWith('a:')))];
  // The busiest neighbours only; the rest are named in the subtitle count.
  const keepNear = new Set(near.map(id => ({ id, n: edges.filter(e => e.from === id || e.to === id).reduce((s, e) => s + e.count, 0) })).sort((a, b) => b.n - a.n).slice(0, 6).map(x => x.id));
  edges = edges.filter(e => (!e.from.startsWith('a:') || keepNear.has(e.from)) && (!e.to.startsWith('a:') || keepNear.has(e.to))).slice(0, 24);
  // Words on the ten strongest arrows only; the rest say it on hover.
  // (Two neighbours importing each other is the overview's business, so those were left out above.)
  edges.forEach((e, i) => { e.detail = e.label; if (i >= 10) e.label = ''; });
  for (const id of keepNear) {
    const a = id.slice(2), other = groupOf.get(a), n = code.filter(m => m.area === a).length;
    nodes.push({ id, title: other?.label ?? areaNames([a]).get(a), kind: areaKind(code.filter(m => m.area === a).map(m => m.file)),
      group: null, color: other?.color ?? '#86868b', area: a, sub: `${plural(n, 'file')} · open`, users: 0, neighbour: true });
  }
  const svc = servicesFor(model, key, id => pick.has(id));
  const all = [...edges, ...svc.edges];
  all.forEach((e, i) => { e.id = 'e' + i; });
  return { level: 'focus', area, groups: [{ ...g, files: mine.length }], nodes, services: svc.services, actor: null, edges: all, meta: model.meta,
    hidden: mine.length - pick.size };
}

function labelOf(names, count) {
  const pretty = names.filter(n => n !== 'default').slice(0, 2);
  if (!pretty.length) return count > 1 ? `${count} imports` : 'imports';
  return pretty.join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
}

// ---------------------------------------------------------------- layout

const FONT = `'General Sans', 'Segoe UI', system-ui, sans-serif`;
const tw = (s, px) => Math.ceil(String(s).length * px * 0.56);
/** The small line under a part's name. */
export const subOf = n => n.sub ?? (n.pkgs ? n.pkgs.slice(0, 2).join(', ') : base(n.file ?? ''));
// A subsystem on the overview is a big card: name, size and its main files, read from across a room.
const big = n => n.area && !n.neighbour;
const nodeSize = n => n.kind === 'actor' ? { width: 120, height: 120 }
  : big(n) ? { width: Math.min(440, Math.max(280, tw(n.title, 26) + 70, tw(subOf(n), 15) + 60)), height: 112 }
  : { width: Math.min(360, Math.max(168, tw(n.title, 15) + 44, tw(subOf(n), 12) + 44)), height: ({ data: 78, cache: 78, cloud: 92, ui: 74, queue: 66 })[n.kind] ?? 62 };

/** The outline of a part, by what it is: a cylinder for a database, a cloud for a hosted service,
 *  a pipe for a queue, a browser window for UI, a cut-corner plate for an API, a page with a folded
 *  corner for config, a box with side rails for a tool. Returns the body and any inner lines. */
export function shapeOf(kind, x, y, w, h) {
  const r = 12, rect = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
  if (kind === 'data' || kind === 'cache') {
    const ry = 10;
    return { body: `M${x} ${y + ry}a${w / 2} ${ry} 0 0 1 ${w} 0v${h - 2 * ry}a${w / 2} ${ry} 0 0 1 ${-w} 0z`,
      lines: `M${x} ${y + ry}a${w / 2} ${ry} 0 0 0 ${w} 0` + (kind === 'data' ? `M${x} ${y + ry + 12}a${w / 2} ${ry} 0 0 0 ${w} 0` : '') };
  }
  if (kind === 'queue') {
    const rx = 12;
    return { body: `M${x + rx} ${y}H${x + w - rx}a${rx} ${h / 2} 0 0 1 0 ${h}H${x + rx}a${rx} ${h / 2} 0 0 1 0 ${-h}z`, lines: `M${x + w - rx} ${y}a${rx} ${h / 2} 0 0 0 0 ${h}` };
  }
  if (kind === 'cloud') {
    const b = y + h, k = h * 0.36;
    return { body: `M${x + k} ${b}H${x + w - k}A${k} ${k} 0 0 0 ${x + w - k * 0.4} ${y + h * 0.42}A${h * 0.3} ${h * 0.3} 0 0 0 ${x + w * 0.66} ${y + h * 0.16}A${h * 0.42} ${h * 0.42} 0 0 0 ${x + w * 0.3} ${y + h * 0.22}A${k} ${k} 0 0 0 ${x + k} ${b}Z`, lines: '' };
  }
  if (kind === 'ui') return { body: rect(x, y, w, h, r), lines: `M${x} ${y + 18}H${x + w}M${x + 14} ${y + 9}h.01M${x + 24} ${y + 9}h.01M${x + 34} ${y + 9}h.01` };
  if (kind === 'api') { const c = 12; return { body: `M${x + c} ${y}H${x + w - c}L${x + w} ${y + c}V${y + h - c}L${x + w - c} ${y + h}H${x + c}L${x} ${y + h - c}V${y + c}Z`, lines: '' }; }
  if (kind === 'config') { const f = 16; return { body: `M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`, lines: `M${x + w - f} ${y}V${y + f}H${x + w}` }; }
  if (kind === 'tool') return { body: rect(x, y, w, h, 6), lines: `M${x + 8} ${y}V${y + h}M${x + w - 8} ${y}V${y + h}` };
  return { body: rect(x, y, w, h, r), lines: '' };
}
/** Where a part's title sits inside its shape. */
export const textTop = kind => ({ data: 44, cache: 40, cloud: 56, ui: 40, queue: 31 })[kind] ?? 27;

let elkReady = null;
/** ELK, loaded once from the CDN. */
export function loadElk() {
  if (globalThis.ELK) return Promise.resolve(new globalThis.ELK());
  return elkReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/elkjs@0.9.3/lib/elk.bundled.js';
    s.onload = () => resolve(new globalThis.ELK()); s.onerror = () => { elkReady = null; reject(new Error('The layout engine could not load.')); };
    document.head.append(s);
  });
}

/** Positions for everything: absolute boxes for groups and nodes, polylines for edges. */
export async function layoutArch(arch, elk) {
  const leaf = n => ({ id: n.id, ...nodeSize(n) });
  if (arch.level === 'overview') return layoutOverview(arch, elk, leaf);
  const root = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': arch.level === 'overview' ? 'RIGHT' : 'DOWN', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': arch.level === 'overview' ? '150' : '64', 'elk.spacing.nodeNode': arch.level === 'overview' ? '56' : '36', 'elk.spacing.edgeNode': '22', 'elk.spacing.edgeEdge': '14',
      'elk.layered.spacing.edgeNodeBetweenLayers': '22', 'elk.spacing.edgeLabel': '4', 'elk.edgeLabels.inline': 'false',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.layered.mergeEdges': 'true', 'elk.padding': '[top=56,left=56,bottom=56,right=56]',    },
    children: [
      ...(arch.actor ? [leaf(arch.actor)] : []),
      ...arch.groups.map(g => ({
        id: g.id, layoutOptions: { 'elk.padding': '[top=58,left=24,bottom=24,right=24]', 'elk.spacing.nodeNode': '30' },
        children: arch.nodes.filter(n => n.group === g.id).map(leaf),
      })),
      ...arch.nodes.filter(n => !n.group).map(leaf),
      ...arch.services.map(leaf),
    ],
    edges: arch.edges.map(e => ({ id: e.id, sources: [e.from], targets: [e.to], labels: e.label ? [{ text: e.label, width: tw(e.label, 12) + 18, height: 22 }] : [] })),
  };
  const out = await elk.layout(root);
  const boxes = new Map();
  const walk = (n, ox, oy) => {
    for (const c of n.children ?? []) { const x = ox + c.x, y = oy + c.y; boxes.set(c.id, { x, y, w: c.width, h: c.height }); walk(c, x, y); }
  };
  walk(out, 0, 0);
  const offsetOf = id => { if (!id || id === 'root') return [0, 0]; const b = boxes.get(id); return b ? [b.x, b.y] : [0, 0]; };
  const edges = [];
  const all = [...(out.edges ?? []), ...(out.children ?? []).flatMap(c => c.edges ?? [])];
  for (const e of all) {
    const [ox, oy] = offsetOf(e.container);
    const sec = e.sections?.[0]; if (!sec) continue;
    const pts = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map(p => [p.x + ox, p.y + oy]);
    const lab = e.labels?.[0];
    let label = lab ? { x: lab.x + ox, y: lab.y + oy, w: lab.width, h: lab.height } : null;
    // On the overview, sit the label on its arrow: the middle of the arrow's longest straight run.
    if (label && arch.level === 'overview') {
      let best = 0, at = pts[0];
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (l > best) { best = l; at = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2]; } }
      label = { ...label, x: at[0] - label.w / 2, y: at[1] - label.h / 2 };
    }
    edges.push({ id: e.id, pts, label });
  }
  return { width: out.width, height: out.height, boxes, edges };
}

/** Push boxes apart until no two are closer than `gap`, each move along the axis that needs least. */
export function separate(all, gap) {
  for (let round = 0; round < 300; round++) {
    let moved = false;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) + gap - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) + gap - Math.max(a.y, b.y);
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      // Lean toward moving sideways: a screen has more room across than down.
      if (ox < oy * 1.4) { const s = (a.x + a.w / 2 <= b.x + b.w / 2 ? 1 : -1) * ox / 2; a.x -= s; b.x += s; }
      else { const s = (a.y + a.h / 2 <= b.y + b.h / 2 ? 1 : -1) * oy / 2; a.y -= s; b.y += s; }
    }
    if (!moved) return;
  }
}

/** The overview has at most a dozen boxes: placed by stress (connected boxes sit near each other,
 *  in a screen-shaped cluster rather than a long row) and joined by straight arrows from border to
 *  border, each label in the middle of its arrow. */
async function layoutOverview(arch, elk, leaf) {
  const parts = [...(arch.actor ? [arch.actor] : []), ...arch.nodes, ...arch.services];
  const linked = new Set(arch.edges.flatMap(e => [e.from, e.to]));
  const out = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'stress', 'elk.stress.desiredEdgeLength': '300', 'elk.spacing.nodeNode': '80', 'elk.padding': '[top=56,left=56,bottom=56,right=56]' },
    children: parts.filter(n => linked.has(n.id)).map(leaf),
    edges: arch.edges.map(e => ({ id: e.id, sources: [e.from], targets: [e.to] })),
  });
  const boxes = new Map((out.children ?? []).map(c => [c.id, { x: c.x, y: c.y, w: c.width, h: c.height }]));
  separate([...boxes.values()], 100);
  // Parts with no import either way would drift anywhere under stress: they line up below instead.
  const alone = parts.filter(n => !linked.has(n.id));
  if (alone.length) {
    const placed = [...boxes.values()], left = placed.length ? Math.min(...placed.map(b => b.x)) : 0;
    const right = Math.max(left + 900, ...placed.map(b => b.x + b.w));
    let x = left, y = placed.length ? Math.max(...placed.map(b => b.y + b.h)) + 110 : 0, row = 0;
    for (const n of alone) {
      const s = nodeSize(n);
      if (x > left && x + s.width > right) { x = left; y += row + 40; row = 0; }
      boxes.set(n.id, { x, y, w: s.width, h: s.height }); x += s.width + 40; row = Math.max(row, s.height);
    }
  }
  // Where the line from a box's centre toward a point leaves the box, plus a small gap.
  const exit = (b, [tx, ty], gap = 8) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
    const t = Math.min(dx ? (b.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + gap) / Math.abs(dy) : Infinity);
    return [cx + dx * t, cy + dy * t];
  };
  const mid = b => [b.x + b.w / 2, b.y + b.h / 2];
  const edges = arch.edges.map(e => {
    const a = boxes.get(e.from), b = boxes.get(e.to);
    const pts = [exit(a, mid(b)), exit(b, mid(a))];
    const w = e.label ? tw(e.label, 12) + 18 : 0, m = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
    return { id: e.id, pts, label: e.label ? { x: m[0] - w / 2, y: m[1] - 11, w, h: 22 } : null };
  });
  // Shift everything so the padding is even, whatever stress did with the coordinates.
  const all = [...boxes.values()], x0 = Math.min(...all.map(b => b.x)) - 56, y0 = Math.min(...all.map(b => b.y)) - 56;
  for (const b of all) { b.x -= x0; b.y -= y0; }
  for (const e of edges) { e.pts = e.pts.map(([x, y]) => [x - x0, y - y0]); if (e.label) { e.label.x -= x0; e.label.y -= y0; } }
  return { width: Math.max(...all.map(b => b.x + b.w)) + 56, height: Math.max(...all.map(b => b.y + b.h)) + 56, boxes, edges };
}

// ---------------------------------------------------------------- drawing

/** Arrow thickness: grows with the number of imports it stands for, slowly. */
export const edgeWidth = n => Math.min(6, 1.6 + Math.log2(Math.max(1, n)) * 0.9);
/** Cut text to fit a width, with an ellipsis. */
export const clip = (s, w, px) => { const max = Math.floor(w / (px * 0.56)); return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s; };

/** Rounded orthogonal path through points. */
function roundPath(pts, r = 10) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const a = Math.min(r, Math.hypot(x1 - x0, y1 - y0) / 2, Math.hypot(x2 - x1, y2 - y1) / 2);
    const ux = Math.sign(x1 - x0), uy = Math.sign(y1 - y0), vx = Math.sign(x2 - x1), vy = Math.sign(y2 - y1);
    d += ` L${x1 - ux * a} ${y1 - uy * a} Q${x1} ${y1} ${x1 + vx * a} ${y1 + vy * a}`;
  }
  const last = pts.at(-1);
  return d + ` L${last[0]} ${last[1]}`;
}

const ICON = {
  api: 'M3 6h14M3 10h14M3 14h9', ui: 'M3 4h14v10H3zM3 7h14', data: 'M4 5c0-2 12-2 12 0v10c0 2-12 2-12 0zM4 5c0 2 12 2 12 0', config: 'M10 3v3M10 14v3M3 10h3M14 10h3M10 7a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  lib: 'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z', core: 'M10 3l7 4v6l-7 4-7-4V7z', cache: 'M11 3L5 11h5l-1 6 6-8h-5z', queue: 'M3 6h14M3 10h14M3 14h14M14 3l3 3-3 3', cloud: 'M6 15h9a3 3 0 0 0 0-6a5 5 0 0 0-9.6 1A2.5 2.5 0 0 0 6 15z', tool: 'M12 3l5 5-9 9H3v-5z',
};

/** The whole diagram as an SVG string. `theme` is 'dark' (the page) or 'light' (READMEs). */
export function renderArch(arch, lay, { theme = 'light', title = true } = {}) {
  const T = theme === 'dark'
    ? { bg: '#0d2a1c', dot: '#2c2c2e', ink: '#ffffff', muted: '#a1a1a6', node: '#2c2c2e', node2: '#3a3a3c', edge: '#86868b', labelBg: '#0d2a1c' }
    : { bg: '#ffffff', dot: '#dedede', ink: '#0d2a1c', muted: '#5f6b64', node: '#ffffff', node2: '#ebebeb', edge: '#86868b', labelBg: '#ffffff' };
  const head = title ? 120 : 0;
  const W = Math.ceil(lay.width), H = Math.ceil(lay.height) + head + 40;
  const color = new Map([...arch.groups.map(g => [g.id, g.color]), ...arch.nodes.map(n => [n.id, n.color])]);
  const nodeOf = new Map([...arch.nodes, ...arch.services, ...(arch.actor ? [arch.actor] : [])].map(n => [n.id, n]));
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" role="img" aria-label="${esc(`Architecture of ${arch.meta.full}`)}">`);
  o.push(`<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.5" fill="${T.dot}"/></pattern>`);
  for (const c of new Set([...color.values(), T.edge])) o.push(`<marker id="m${c.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0 1L10 5L0 9z" fill="${c}"/></marker>`);
  o.push(`</defs><rect width="${W}" height="${H}" fill="${T.bg}"/><rect width="${W}" height="${H}" fill="url(#dots)"/>`);
  if (title) {
    o.push(`<text x="56" y="76" font-size="56" font-weight="700" letter-spacing="-1.6" fill="${T.ink}">${esc(arch.meta.name)}</text>`);
    const g0 = arch.groups[0];
    const what = arch.level === 'overview' ? `${arch.nodes.length} subsystems · each arrow is every import between two of them`
      : arch.level === 'focus' ? `${g0.label}: ${arch.nodes.filter(n => n.file).length} of its ${g0.files} files${arch.nodes.some(n => n.neighbour) ? ', and the subsystems it talks to' : ''}`
      : `${arch.nodes.length} components in ${arch.groups.length} subsystems${arch.hidden > 0 ? ` · ${arch.hidden} smaller files folded into them` : ''}`;
    o.push(`<text x="56" y="100" font-size="15" fill="${T.muted}">${esc(`${arch.meta.full} @ ${arch.meta.sha.slice(0, 7)} · ${what}`)}</text>`);
  }
  o.push(`<g transform="translate(0 ${head})">`);
  // Subsystems.
  for (const g of arch.groups) {
    const b = lay.boxes.get(g.id); if (!b) continue;
    o.push(`<g class="grp" data-id="${g.id}"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="18" fill="${g.color}" fill-opacity="${theme === 'dark' ? 0.07 : 0.06}" stroke="${g.color}" stroke-opacity="0.35" stroke-width="1.5"/>`);
    o.push(`<circle cx="${b.x + 26}" cy="${b.y + 29}" r="6" fill="${g.color}"/><text x="${b.x + 42}" y="${b.y + 35}" font-size="17" font-weight="700" fill="${T.ink}">${esc(g.label)}</text>`);
    o.push(`<text x="${b.x + b.w - 20}" y="${b.y + 35}" font-size="12.5" fill="${T.muted}" text-anchor="end">${esc(`${g.path} · ${g.files} file${g.files === 1 ? '' : 's'}`).slice(0, Math.max(10, Math.floor((b.w - tw(g.label, 17) - 70) / 6.8)))}</text></g>`);
  }
  // Arrows under everything.
  const eById = new Map(arch.edges.map(e => [e.id, e]));
  for (const e of lay.edges) {
    const a = eById.get(e.id), c = a.external ? T.edge : a.from === 'actor' ? T.ink : color.get(a.from) ?? T.edge;
    o.push(`<path class="edge" data-from="${esc(a.from)}" data-to="${esc(a.to)}" d="${roundPath(e.pts)}" fill="none" stroke="${c}" stroke-width="${edgeWidth(a.count)}" stroke-opacity="0.85" ${a.external ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#m${c.slice(1)})"${a.both ? ` marker-start="url(#m${c.slice(1)})"` : ''}>${a.detail ? `<title>${esc(a.detail)}</title>` : ''}</path>`);
  }
  // Components, services and the person using it.
  for (const [id, b] of lay.boxes) {
    const n = nodeOf.get(id); if (!n) continue;
    const c = color.get(id) ?? T.muted;
    if (n.kind === 'actor') {
      o.push(`<g class="node" data-id="actor"><circle cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" r="${b.w / 2}" fill="${T.node}" stroke="${T.ink}" stroke-width="2"/><circle cx="${b.x + b.w / 2}" cy="${b.y + 42}" r="13" fill="none" stroke="${T.ink}" stroke-width="2.4"/><path d="M${b.x + b.w / 2 - 22} ${b.y + 82}c4-16 40-16 44 0" fill="none" stroke="${T.ink}" stroke-width="2.4"/><text x="${b.x + b.w / 2}" y="${b.y + 104}" font-size="14" font-weight="700" fill="${T.ink}" text-anchor="middle">${esc(n.title)}</text></g>`);
      continue;
    }
    const svc = id.startsWith('svc:');
    const stroke = svc ? T.ink : c, fill = svc ? T.node2 : T.node;
    o.push(`<g class="node${n.area ? ' area' : ''}" data-id="${esc(id)}" ${n.file ? `data-file="${esc(n.file)}" tabindex="0" role="link"` : n.area ? `data-area="${esc(n.area)}" tabindex="0" role="button" aria-label="Open ${esc(n.title)}"` : ''}>`);
    const sh = shapeOf(big(n) ? 'core' : n.kind, b.x, b.y, b.w, b.h);
    o.push(`<path d="${sh.body}" fill="${fill}" stroke="${stroke}" stroke-width="${n.heart ? 3 : 1.8}" stroke-linejoin="round" ${(svc && n.kind !== 'cloud') || n.neighbour ? 'stroke-dasharray="6 5"' : ''}/>`);
    if (sh.lines) o.push(`<path d="${sh.lines}" fill="none" stroke="${stroke}" stroke-width="${n.kind === 'ui' ? 1.4 : 1.8}" stroke-linecap="round"/>`);
    if (big(n)) {
      o.push(`<rect x="${b.x + 18}" y="${b.y + 20}" width="6" height="34" rx="3" fill="${c}"/>`);
      o.push(`<text x="${b.x + 36}" y="${b.y + 46}" font-size="26" font-weight="700" letter-spacing="-.4" fill="${T.ink}">${esc(n.title)}</text>`);
      o.push(`<text x="${b.x + 36}" y="${b.y + 74}" font-size="15" fill="${T.muted}">${esc(clip(subOf(n), b.w - 56, 15))}</text>`);
      o.push(`<text x="${b.x + b.w - 18}" y="${b.y + b.h - 14}" font-size="13" font-weight="700" fill="${c}" text-anchor="end">Open →</text>`);
    } else {
      const ty = b.y + textTop(n.kind);
      o.push(`<g transform="translate(${b.x + 14} ${ty - 14}) scale(.85)"><path d="${ICON[n.kind] ?? ICON.core}" fill="none" stroke="${svc ? T.muted : c}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g>`);
      o.push(`<text x="${b.x + 38}" y="${ty}" font-size="15" font-weight="700" fill="${T.ink}">${esc(n.title)}</text>`);
      o.push(`<text x="${b.x + 38}" y="${ty + 19}" font-size="12" fill="${T.muted}">${esc(clip(subOf(n), b.w - 52, 12))}</text>`);
    }
    if (n.heart) o.push(`<rect x="${b.x + b.w - 58}" y="${b.y - 11}" width="50" height="20" rx="10" fill="${c}"/><text x="${b.x + b.w - 33}" y="${b.y + 3}" font-size="10.5" font-weight="800" fill="${T.bg}" text-anchor="middle" letter-spacing=".06em">CORE</text>`);
    else if (n.usedBy) o.push(`<rect x="${b.x + b.w - 96}" y="${b.y - 11}" width="88" height="20" rx="10" fill="${c}"/><text x="${b.x + b.w - 52}" y="${b.y + 3}" font-size="10.5" font-weight="800" fill="${T.bg}" text-anchor="middle" letter-spacing=".04em">USED BY ${n.usedBy}</text>`);
    else if (n.entry) o.push(`<rect x="${b.x + b.w - 62}" y="${b.y - 11}" width="54" height="20" rx="10" fill="${T.ink}"/><text x="${b.x + b.w - 35}" y="${b.y + 3}" font-size="10.5" font-weight="800" fill="${T.bg}" text-anchor="middle" letter-spacing=".06em">ENTRY</text>`);
    o.push('</g>');
  }
  // Labels last, so no box ever covers one.
  for (const e of lay.edges) {
    if (!e.label) continue;
    const a = eById.get(e.id);
    o.push(`<g class="elabel" data-from="${esc(a.from)}" data-to="${esc(a.to)}"><rect x="${e.label.x}" y="${e.label.y}" width="${e.label.w}" height="${e.label.h}" rx="11" fill="${T.labelBg}" stroke="${T.node2}"/><text x="${e.label.x + e.label.w / 2}" y="${e.label.y + 15}" font-size="12" fill="${T.muted}" text-anchor="middle">${esc(a.label)}</text></g>`);
  }
  o.push('</g>');
  o.push(`<text x="${W - 56}" y="${H - 18}" font-size="12.5" fill="${T.muted}" text-anchor="end">Arrows are real imports, labelled with what they import · drawn by RepoTale</text>`);
  o.push('</svg>');
  return o.join('');
}

/** The same diagram as Mermaid, which GitHub draws inside any markdown file. */
export function mermaidArch(arch) {
  const id = s => 'n' + [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  const q = s => String(s).replace(/"/g, "'");
  const L = ['flowchart TD'];
  if (arch.actor) L.push(`  ${id('actor')}(("${q(arch.actor.title)}"))`);
  const box = n => `${id(n.id)}${n.kind === 'data' ? `[("${q(n.title)}<br/>${q(subOf(n))}")]` : `["${q(n.title)}<br/>${q(subOf(n))}"]`}`;
  for (const g of arch.groups) {
    L.push(`  subgraph ${g.id}["${q(g.label)}"]`);
    for (const n of arch.nodes.filter(n => n.group === g.id)) L.push('    ' + box(n));
    L.push('  end');
  }
  for (const n of arch.nodes.filter(n => !n.group)) L.push('  ' + box(n));
  for (const s of arch.services) L.push(`  ${id(s.id)}${s.kind === 'data' ? `[("${q(s.title)}")]` : `{{"${q(s.title)}"}}`}`);
  for (const e of arch.edges) L.push(`  ${id(e.from)} ${e.external ? '-.->' : e.both ? '<-->' : '-->'}${e.label ? `|"${q(e.label)}"|` : ''} ${id(e.to)}`);
  arch.groups.forEach(g => L.push(`  style ${g.id} fill:${g.color}14,stroke:${g.color}`));
  return L.join('\n');
}
