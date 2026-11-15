// reporeel: make a repository understood. Each command does one job; `reporeel` alone runs them in order.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from './render.ts';
import type { Storyboard } from './storyboard.ts';

const [cmd = 'help', ...rest] = process.argv.slice(2);
const flag = (name: string, def?: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : def; };
const log = (m: string) => process.stderr.write(m + '\n');

const commands: Record<string, () => Promise<void>> = {
  async video() {
    const file = resolve(rest.find(a => !a.startsWith('--') && rest[rest.indexOf(a) - 1]?.startsWith('--') !== true) ?? 'reporeel.json');
    const sb: Storyboard = JSON.parse(readFileSync(file, 'utf8'));
    const voice = flag('voice');
    if (voice) sb.voice = { ...(sb.voice ?? { provider: 'kokoro' }), provider: voice as any };
    const r = await render(sb, file, { out: flag('out', 'docs/reporeel')!, log });
    console.log(JSON.stringify(r, null, 1));
  },
  async help() {
    console.log(`reporeel: make your repository understood

  reporeel video [storyboard.json] [--out dir] [--voice kokoro|elevenlabs|none]
      render the storyboard into a narrated MP4, GIF preview, captions and a README section
`);
  },
};

const run = commands[cmd] ?? (async () => { log(`unknown command: ${cmd}`); await commands.help(); process.exitCode = 1; });
run().catch(e => { log(`error: ${e.message}`); process.exitCode = 1; });
