// Reads manifests to work out what a project is built with. Used for the default architecture
// diagram and the first draft of a storyboard. Deterministic: no model involved.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { Graph } from './graph.ts';

export interface Part { dir: string; name: string; kind: 'frontend' | 'backend' | 'cli' | 'library' | 'ml' | 'contracts' | 'infra' | 'tests' | 'docs'; tech: string[] }
export interface Stack { name: string; parts: Part[]; stores: string[]; services: string[]; dev?: { cmd: string; port: number; dir: string } }

const JS: [RegExp, string, Part['kind']?][] = [
  [/^next$/, 'Next.js', 'frontend'], [/^react$/, 'React', 'frontend'], [/^vue$/, 'Vue', 'frontend'], [/^svelte$|^@sveltejs\/kit$/, 'Svelte', 'frontend'],
  [/^vite$/, 'Vite'], [/^astro$/, 'Astro', 'frontend'], [/^express$/, 'Express', 'backend'], [/^fastify$/, 'Fastify', 'backend'], [/^hono$/, 'Hono', 'backend'],
  [/^@nestjs\/core$/, 'NestJS', 'backend'], [/^electron$/, 'Electron', 'frontend'], [/^commander$|^yargs$|^cac$/, 'CLI', 'cli'],
  [/^@modelcontextprotocol\/sdk$/, 'MCP server', 'backend'], [/^three$|^@react-three\/fiber$/, 'Three.js'], [/^maplibre-gl$|^mapbox-gl$|^deck\.gl$|^@deck\.gl\/core$/, 'maps'],
  [/^onnxruntime-web$|^@tensorflow\/tfjs$|^@mediapipe\//, 'ML in the browser', 'ml'], [/^openai$|^@anthropic-ai\/sdk$|^ai$|^@google\/generative-ai$/, 'LLM API'],
  [/^ethers$|^viem$|^wagmi$|^hardhat$|^@ethereumjs\/vm$/, 'Ethereum', 'contracts'], [/^snarkjs$|^circomlibjs$/, 'zero-knowledge proofs', 'contracts'],
  [/^playwright$|^@playwright\/test$/, 'Playwright', 'tests'], [/^vitest$|^jest$|^mocha$/, 'tests', 'tests'], [/^tailwindcss$/, 'Tailwind'],
];
const PY: [RegExp, string, Part['kind']?][] = [
  [/^fastapi$/, 'FastAPI', 'backend'], [/^flask$/, 'Flask', 'backend'], [/^django$/, 'Django', 'backend'], [/^streamlit$/, 'Streamlit', 'frontend'], [/^gradio$/, 'Gradio', 'frontend'],
  [/^torch$|^tensorflow$|^jax$/, 'deep learning', 'ml'], [/^scikit-learn$|^xgboost$|^lightgbm$/, 'machine learning', 'ml'], [/^transformers$/, 'Transformers', 'ml'],
  [/^langchain|^llama[-_]index|^openai$|^anthropic$/, 'LLM API'], [/^typer$|^click$/, 'CLI', 'cli'], [/^pytest$/, 'tests', 'tests'], [/^numpy$|^pandas$/, 'data'],
];
const STORES: [RegExp, string][] = [[/postgres|psycopg|^pg$|asyncpg|prisma|drizzle|sqlalchemy|postgis/, 'PostgreSQL'], [/mongo/, 'MongoDB'], [/sqlite|better-sqlite3/, 'SQLite'], [/redis|ioredis/, 'Redis'], [/supabase/, 'Supabase'], [/firebase/, 'Firebase']];

function deps(dir: string): { names: string[]; lang: 'js' | 'py' | 'other'; scripts: Record<string, string>; bin?: boolean } {
  try {
    const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return { names: Object.keys({ ...p.dependencies, ...p.devDependencies, ...p.peerDependencies }), lang: 'js', scripts: p.scripts ?? {}, bin: !!p.bin };
  } catch {}
  const py = ['requirements.txt', 'pyproject.toml', 'setup.py'].map(f => join(dir, f)).filter(existsSync);
  if (py.length) {
    const text = py.map(f => readFileSync(f, 'utf8')).join('\n').toLowerCase();
    return { names: [...text.matchAll(/^\s*["']?([a-z0-9][a-z0-9._-]*)/gm)].map(m => m[1]), lang: 'py', scripts: {} };
  }
  return { names: [], lang: 'other', scripts: {} };
}

function part(root: string, rel: string): Part | undefined {
  const dir = join(root, rel), d = deps(dir);
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const tech = new Set<string>(); const kinds = new Set<Part['kind']>();
  for (const [re, name, kind] of d.lang === 'js' ? JS : PY) if (d.names.some(n => re.test(n))) { tech.add(name); if (kind) kinds.add(kind); }
  if (d.bin) kinds.add('cli'), tech.add('CLI');
  if (files.some(f => f.endsWith('.sol')) || /contracts?$/.test(rel)) kinds.add('contracts'), tech.add('Solidity');
  if (files.some(f => f.endsWith('.circom'))) kinds.add('contracts'), tech.add('Circom');
  if (files.includes('Dockerfile') || files.includes('docker-compose.yml')) tech.add('Docker');
  if (files.includes('index.html')) kinds.add('frontend');
  if (!d.names.length && !tech.size && !Object.keys(d.scripts).length && !kinds.size) return undefined;
  const kind = (['cli', 'frontend', 'backend', 'contracts', 'ml', 'tests'] as const).find(k => kinds.has(k)) ?? (d.lang === 'other' ? 'infra' : 'library');
  return { dir: rel || '.', name: rel || 'app', kind, tech: [...tech] };
}

export function detect(root: string): Stack {
  // A workspace root often has a package.json with no name; the folder name is the honest fallback.
  const name: string = (() => { try { const n = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name; if (typeof n === 'string' && n) return n; } catch {} return basename(resolve(root)); })();
  const subdirs = readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.') && !['node_modules', 'dist', 'build', 'docs'].includes(e.name)).map(e => e.name);
  const parts = [part(root, ''), ...subdirs.map(s => part(root, s))].filter((p): p is Part => !!p);
  const all = [root, ...subdirs.map(s => join(root, s))].flatMap(d => deps(d).names);
  const stores = STORES.filter(([re]) => all.some(n => re.test(n))).map(([, n]) => n);
  const services = [...new Set(all.flatMap(n => /stripe/.test(n) ? ['Stripe'] : /elevenlabs/.test(n) ? ['ElevenLabs'] : /^openai$/.test(n) ? ['OpenAI'] : /anthropic/.test(n) ? ['Anthropic'] : []))];
  // How to run it locally, if there is an obvious dev script.
  let dev: Stack['dev'];
  for (const p of parts) {
    const s = deps(join(root, p.dir)).scripts, cmd = s.dev ? 'dev' : s.start ? 'start' : s.preview ? 'preview' : undefined;
    if (cmd && (p.kind === 'frontend' || !dev)) {
      const port = /next/.test(s[cmd]) ? 3000 : /vite/.test(s[cmd]) ? 5173 : /astro/.test(s[cmd]) ? 4321 : 3000;
      // Most Node servers (Next.js, Express, plain http) honour PORT; Vite and Astro use their own flag.
      const pinned = /vite|astro/.test(s[cmd]) ? `npm run ${cmd} -- --port ${port}` : `PORT=${port} npm run ${cmd}`;
      dev = { cmd: pinned, port, dir: p.dir };
    }
  }
  return { name, parts: parts.length > 1 ? parts.filter(p => p.dir !== '.' || p.tech.length > 1) : parts, stores, services, dev };
}

/** A first architecture diagram from what the manifests say. Agents (or people) refine it. */
/** Imports from files under part `a` to files under part `b`, or null when the parts cannot be told
 *  apart by folder (one of them is the repository root). */
function importsBetween(g: Graph, a: Part, b: Part): number | null {
  if (a.dir === '.' || b.dir === '.') return null;
  const under = (f: string, p: Part) => f.startsWith(p.dir.replace(/\/?$/, '/'));
  return g.modules.filter(m => under(m.file, a)).reduce((n, m) => n + m.imports.filter(f => under(f, b)).length, 0);
}

/** A first architecture diagram. Part order comes from the manifests, so an arrow is an inference
 *  unless the code graph confirms it: confirmed arrows are solid and say how many imports back them,
 *  inferred ones are dashed and say so. Stores and services come from dependency names, so they are
 *  always dashed. */
export function mermaidFor(st: Stack, g?: Graph): string {
  const id = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_');
  const label = (p: Part) => `${p.name}${p.tech.length ? '<br/>' + p.tech.slice(0, 3).join(', ') : ''}`;
  const lines = ['flowchart LR'];
  const users = st.parts.some(p => p.kind === 'frontend') ? 'U([User]) --> ' : '';
  const order: Part['kind'][] = ['frontend', 'cli', 'backend', 'ml', 'contracts', 'library'];
  const ranked = order.flatMap(k => st.parts.filter(p => p.kind === k));
  const chain = ranked.length ? ranked : st.parts;
  chain.forEach(p => lines.push(`  ${id(p.name)}["${label(p).replace(/"/g, "'")}"]`));
  if (users && chain[0]) lines.push(`  ${users}${id(chain[0].name)}`);
  // Every pair of parts whose files import each other gets a solid arrow, from importer to imported.
  const linked = new Set<Part>();
  if (g) for (const a of chain) for (const b of chain) {
    const n = a === b ? 0 : importsBetween(g, a, b) ?? 0;
    if (n) { lines.push(`  ${id(a.name)} -->|${n} import${n === 1 ? '' : 's'}| ${id(b.name)}`); linked.add(a); linked.add(b); }
  }
  // A part no import connects is placed next to its neighbour by kind, and the arrow says it is a guess.
  for (let i = 1; i < chain.length; i++) if (!linked.has(chain[i - 1]) || !linked.has(chain[i])) lines.push(`  ${id(chain[i - 1].name)} -.->|inferred| ${id(chain[i].name)}`);
  const last = chain.find(p => p.kind === 'backend') ?? chain.at(-1);
  st.stores.forEach(s => lines.push(`  ${id(last?.name ?? 'app')} -.->|dependency| ${id(s)}[(${s})]`));
  st.services.forEach(s => lines.push(`  ${id(last?.name ?? 'app')} -.->|dependency| ${id(s)}{{${s}}}`));
  return lines.join('\n');
}
