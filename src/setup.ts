// `reporeel setup`: checks everything a render needs and says exactly how to fix what is missing.
// With --fix it installs the Playwright Chromium itself (the only download it will make).
import { execSync } from 'node:child_process';
import { ffmpegPath } from './ffmpeg.ts';

export interface Item { name: string; ok: boolean; detail: string; fix?: string; required: boolean }

export async function checkSetup(o: { fix?: boolean; log?: (m: string) => void } = {}): Promise<Item[]> {
  const items: Item[] = [];
  const [maj, min] = process.versions.node.split('.').map(Number);
  items.push({ name: 'node', required: true, ok: maj > 22 || (maj === 22 && min >= 18), detail: `v${process.versions.node}`, fix: 'Install Node 22.18 or newer (https://nodejs.org)' });

  const ff = ffmpegPath();
  items.push({ name: 'ffmpeg', required: true, ok: !!ff, detail: ff ? `${ff.source}` : 'not found', fix: 'Install ffmpeg (brew install ffmpeg, apt install ffmpeg, winget install ffmpeg) or `npm i -g ffmpeg-static`' });

  const browser = async () => {
    try { const { chromium } = await import('playwright'); const b = await chromium.launch(); const v = b.version(); await b.close(); return v; }
    catch { return undefined; }
  };
  let v = await browser();
  if (!v && o.fix) {
    o.log?.('installing Chromium for Playwright…');
    try { execSync('npx -y playwright install chromium', { stdio: 'inherit' }); v = await browser(); } catch {}
  }
  items.push({ name: 'chromium', required: true, ok: !!v, detail: v ? `Chromium ${v}` : 'Playwright cannot launch Chromium', fix: 'reporeel setup --fix   (or: npx playwright install chromium)' });

  items.push({ name: 'voice: kokoro', required: false, ok: true, detail: 'free local English voice, downloads about 90 MB on first use' });
  items.push({ name: 'voice: elevenlabs', required: false, ok: !!process.env.ELEVENLABS_API_KEY, detail: process.env.ELEVENLABS_API_KEY ? 'ELEVENLABS_API_KEY is set' : 'optional: set ELEVENLABS_API_KEY for Hindi and other languages' });
  items.push({ name: 'planning: claude', required: false, ok: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), detail: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'Anthropic credentials found' : 'optional: set ANTHROPIC_API_KEY so `plan` and `dub` can use Claude (or use the agent skill)' });
  return items;
}

export function formatSetup(items: Item[]): string {
  const tty = process.stdout.isTTY, col = (n: number, s: string) => (tty ? `\x1b[${n}m${s}\x1b[0m` : s);
  const lines = items.map(i => `  ${i.ok ? col(32, '✓') : i.required ? col(31, '✗') : col(33, '·')} ${i.name.padEnd(18)} ${i.detail}${!i.ok && i.fix ? `\n    ${col(36, '→ ' + i.fix)}` : ''}`);
  const ready = items.every(i => i.ok || !i.required);
  return `\n${lines.join('\n')}\n\n  ${ready ? col(32, 'ready to render') : col(31, 'not ready: fix the ✗ items above')}\n`;
}
