// `repotale mcp`: an MCP server over stdio that lets a coding agent ask about this repository's
// structure and get answers from its real import graph, with file and line, instead of guessing:
// what a change reaches, who imports a file, where to start reading, the path between two files.
// It reads the working tree (nothing is run) with the same model and insight code as the website.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { files } from './doctor.ts';
// @ts-ignore: plain ES modules shared with the website
import { buildModel, CODE, SKIP, blastRadius } from '../web/analyze.js';
// @ts-ignore
import { startHere, prImpact } from '../web/insight.js';
// @ts-ignore
import { pathBetween } from '../web/story.js';

const MANIFESTS = ['package.json', 'tsconfig.json', 'jsconfig.json', 'requirements.txt', 'pyproject.toml', 'go.mod'];
const MAX_BYTES = 400_000;

/** The model of the repository at `root`, read from disk. */
export function localModel(root: string) {
  const paths = files(root);
  const texts: Record<string, string> = {}, manifests: Record<string, string> = {};
  for (const p of paths) {
    if (!CODE.test(p) || SKIP.test(p)) continue;
    try { if (statSync(join(root, p)).size <= MAX_BYTES) texts[p] = readFileSync(join(root, p), 'utf8'); } catch {}
  }
  for (const m of MANIFESTS) if (existsSync(join(root, m))) manifests[m] = readFileSync(join(root, m), 'utf8');
  let sha = 'working-tree';
  try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  return buildModel({ meta: { name: basename(root), full: basename(root), sha, truncated: false }, paths, texts, manifests });
}

const list = (a: string[], n = 12) => a.slice(0, n).map(x => `- ${x}`).join('\n') + (a.length > n ? `\n- … and ${a.length - n} more` : '');

export const TOOLS = [
  { name: 'repo_overview', description: 'Map of this repository from its import graph: subsystems, the most imported (core) modules, entry points, import cycles and totals. Call this first to orient yourself.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'start_here', description: 'The files to read first to understand this repository, in order, with why each matters and how long it takes to read.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'impact', description: 'What a change to these files can break: every file that depends on them through imports, the tests on those paths, changed files no test reaches, and a risk level. Use before editing widely used code, and to review a diff.',
    inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'Repository-relative paths, e.g. ["src/db.ts"]' } }, required: ['files'], additionalProperties: false } },
  { name: 'who_imports', description: 'The files that import this file directly, with the line of each import and the names they take, plus how many files depend on it in all.',
    inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'], additionalProperties: false } },
  { name: 'explain_file', description: 'A file\'s place in the system: its top-level declarations with lines, what it imports and from where, what imports it, and which tests reach it.',
    inputSchema: { type: 'object', properties: { file: { type: 'string' } }, required: ['file'], additionalProperties: false } },
  { name: 'import_path', description: 'The chain of imports that leads from one file to another, if there is one.',
    inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'], additionalProperties: false } },
];

/** One tool call against a model. Returns text; throws on bad input. */
export function callTool(model: any, name: string, args: any = {}): string {
  const byFile = new Map<string, any>(model.modules.map((m: any) => [m.file, m]));
  const need = (f: string) => {
    if (byFile.has(f)) return byFile.get(f);
    const close = [...byFile.keys()].filter(k => k.endsWith('/' + f.split('/').pop())).slice(0, 5);
    throw new Error(`No source file "${f}" in the graph.${close.length ? ` Did you mean: ${close.join(', ')}?` : ''}`);
  };
  switch (name) {
    case 'repo_overview': {
      const t = model.totals;
      return [`${t.code} source files, ${t.lines} lines, ${t.tests} test files, ${t.edges} imports between them.`,
        `\nSubsystems (callers first, foundations last):\n${list(model.areas.map((a: any) => `${a.name}: ${a.files.length} files`))}`,
        `\nCore modules (most imported):\n${list(model.core.map((m: any) => `${m.file}: imported by ${m.importedBy.length}`))}`,
        `\nEntry points:\n${model.entries.length ? list(model.entries.map((m: any) => `${m.file}: imports ${m.imports.length}`)) : '- none found (every file is imported by another)'}`,
        `\nImport cycles: ${model.cycles.length ? '\n' + list(model.cycles.map((c: any) => c.loop.join(' -> '))) : 'none'}`].join('\n');
    }
    case 'start_here': {
      const s = startHere(model);
      return `Read in this order (about ${s.minutes} minutes, ${s.lines} lines):\n` + s.files.map((f: any, i: number) => `${i + 1}. ${f.file} (${f.minutes} min): ${f.why}`).join('\n');
    }
    case 'impact': {
      if (!Array.isArray(args.files) || !args.files.length) throw new Error('Give "files": a list of repository-relative paths.');
      const r = prImpact(model, args.files.map((f: string) => ({ filename: f, status: 'modified' })));
      return [`Risk: ${r.level}. ${r.files.length} source file(s) changed; through imports they reach ${r.dependents.length} more source files; ${r.tests.length} test file(s) sit on those paths.`,
        r.risks.length ? `\nLook at first:\n${list(r.risks.map((x: any) => `${x.file}: ${x.why}`))}` : '',
        `\nPer file:\n${list(r.files.map((f: any) => `${f.file}: reaches ${f.reach}, tests on path ${f.tests}`))}`,
        r.dependents.length ? `\nDependents:\n${list(r.dependents, 25)}` : '',
        r.tests.length ? `\nTests to run:\n${list(r.tests, 25)}` : '',
        r.notRead.length ? `\nNot in the graph (not source, or not found): ${r.notRead.join(', ')}` : ''].filter(Boolean).join('\n');
    }
    case 'who_imports': {
      const m = need(args.file);
      const direct = model.edges.filter((e: any) => e.to === m.file);
      return `${m.file} is imported directly by ${direct.length} file(s) and reached by ${blastRadius(m.file, model.edges).size} in all.\n` +
        list(direct.map((e: any) => `${e.from}:${e.line}${e.names?.length ? ` (${e.names.join(', ')})` : ''}`), 40);
    }
    case 'explain_file': {
      const m = need(args.file);
      const out = model.edges.filter((e: any) => e.from === m.file), tests = model.testsReaching(m.file);
      return [`${m.file}: ${m.lines} lines${m.test ? ', a test file' : ''}.`,
        m.symbols.length ? `\nDeclares:\n${list(m.symbols.map((s: any) => `${s.name} (${s.kind}) at line ${s.line}`), 30)}` : '',
        out.length ? `\nImports from the repo:\n${list(out.map((e: any) => `${e.to} at line ${e.line}${e.names?.length ? `: ${e.names.join(', ')}` : ''}`), 30)}` : '',
        m.external.length ? `\nPackages: ${[...new Set(m.external)].join(', ')}` : '',
        `\nImported by ${m.importedBy.length}: ${m.importedBy.slice(0, 15).join(', ') || 'nothing'}`,
        `\nTests that reach it: ${tests.length ? tests.slice(0, 15).join(', ') : 'none found'}`].filter(Boolean).join('\n');
    }
    case 'import_path': {
      need(args.from); need(args.to);
      const p = pathBetween(args.from, args.to, model.edges);
      return p ? `${p.length - 1} step(s): ${p.join(' -> ')}` : `${args.from} does not reach ${args.to} through imports.`;
    }
  }
  throw new Error(`Unknown tool: ${name}`);
}

/** Serve MCP over stdin/stdout until stdin closes. The model is rebuilt when files change. */
export function serve(root: string, version = '0') {
  // shortcut: rebuilds the whole graph when it is more than 5 s old; watch files for large monorepos.
  let model: any = null, built = 0;
  const current = () => { if (!model || Date.now() - built > 5000) { model = localModel(root); built = Date.now(); } return model; };
  const send = (msg: object) => process.stdout.write(JSON.stringify(msg) + '\n');
  const rl = createInterface({ input: process.stdin });
  rl.on('line', line => {
    let req: any;
    try { req = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    const { id, method, params } = req;
    if (id === undefined) return; // notifications (initialized, cancelled) need no answer
    try {
      if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'repotale', version } } });
      if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
      if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      if (method === 'tools/call') {
        try { return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: callTool(current(), params?.name, params?.arguments) }] } }); }
        catch (e: any) { return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e.message }], isError: true } }); }
      }
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    } catch (e: any) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } }); }
  });
  return new Promise<void>(done => rl.on('close', done));
}
