import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { localModel, callTool } from '../src/mcp.ts';

// This repository itself is the fixture: the answers must match its real imports.
const model = localModel('.');

test('tools answer from the real graph of this repository', () => {
  assert.match(callTool(model, 'repo_overview'), /source files, .* lines, .* imports between them/);
  assert.match(callTool(model, 'who_imports', { file: 'web/insight.js' }), /web\/app\.js:\d+ \(.*startHere/);
  assert.match(callTool(model, 'explain_file', { file: 'web/insight.js' }), /startHere \(function\) at line \d+/);
  assert.match(callTool(model, 'import_path', { from: 'web/app.js', to: 'web/analyze.js' }), /^1 step\(s\): web\/app\.js -> web\/analyze\.js$/);
  assert.match(callTool(model, 'impact', { files: ['web/analyze.js'] }), /^Risk: (high|medium|low)\./);
  assert.match(callTool(model, 'start_here'), /^Read in this order/);
});

test('a wrong path is an error that suggests the right one', () => {
  assert.throws(() => callTool(model, 'who_imports', { file: 'insight.js' }), /Did you mean: web\/insight\.js/);
});

test('the server speaks MCP over stdio: initialize, list tools, call one', async () => {
  const p = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', "import('./src/mcp.ts').then(m => m.serve('.', 'test'))"], { stdio: ['pipe', 'pipe', 'inherit'] });
  const replies: any[] = [];
  let buf = '';
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { replies.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const w = (o: object) => p.stdin.write(JSON.stringify(o) + '\n');
  w({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  w({ jsonrpc: '2.0', method: 'notifications/initialized' });
  w({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  w({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'import_path', arguments: { from: 'web/app.js', to: 'web/analyze.js' } } });
  w({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } });
  await new Promise<void>((done, fail) => { const t = setInterval(() => { if (replies.length >= 4) { clearInterval(t); done(); } }, 50); setTimeout(() => fail(new Error('timeout')), 20000); });
  p.stdin.end();
  const by = new Map(replies.map(r => [r.id, r]));
  assert.equal(by.get(1).result.serverInfo.name, 'repotale');
  assert.deepEqual(by.get(2).result.tools.map((t: any) => t.name), ['repo_overview', 'start_here', 'impact', 'who_imports', 'explain_file', 'import_path']);
  assert.match(by.get(3).result.content[0].text, /web\/app\.js -> web\/analyze\.js/);
  assert.equal(by.get(4).result.isError, true);
});
