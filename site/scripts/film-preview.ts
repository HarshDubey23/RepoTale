// Prints the film script and the architecture levels for local clones, to read them before they are drawn.
// Run: npx tsx scripts/film-preview.ts <dir> [<dir> ...]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { localModel } from '../../src/mcp.ts';
// @ts-expect-error: plain ES module shared with the website, the CLI and the MCP server
import { startHere } from '../../web/insight.js';
import { archOf } from '../lib/arch.ts';
import { buildFilm } from '../lib/film.ts';

for (const dir of process.argv.slice(2)) {
  const name = dir.split(/[\/]/).pop()!;
  const model = localModel(dir);
  const reading = startHere({ ...model, meta: { ...model.meta, name } });
  const arch = archOf(model);
  console.log(`\n=== ${name}: overview ${arch.overview ? arch.overview.nodes.map(n => `${n.title}[${n.col},${n.row}]`).join(' ') : 'none'}`);
  console.log(`    parts: ${arch.parts.map(p => `${p.title} (${p.nodes.length} boxes, ${p.edges.filter(e => e.drawn).length}/${p.edges.length} drawn)`).join('; ')}`);
  const readmePath = readdirSync(dir).find(f => /^readme/i.test(f)) ?? null;
  const readme = readmePath ? readFileSync(join(dir, readmePath), 'utf8') : null;
  const film = buildFilm(model, reading, arch, { repo: `x/${name}`, sha: 'abc1234', url: '', description: '', readme, readmePath });
  for (const p of arch.parts) console.log(`    part ${p.title}: ${p.nodes.find(n => n.role === 'file' && n.about)?.about?.text ?? '-'}`);
  let words = 0;
  for (const s of film.scenes) for (const b of s.beats) {
    words += b.say.split(/\s+/).length;
    console.log(`  [${s.kind}] ${b.say}  {${b.focus.join(',')}}${b.cite ? `  <${b.cite.file}${b.cite.line ? ':' + b.cite.line : ''}${b.cite.end ? '-' + b.cite.end : ''}>` : ''}`);
  }
  console.log(`  ${words} words, about ${Math.round(words / 170 * 60)} s at 170 wpm`);
}
