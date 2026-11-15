// ffmpeg from REPOREEL_FFMPEG, else the one on PATH, else the bundled ffmpeg-static binary.
// Only ffmpeg is needed: durations are read from its own output, so ffprobe is not required.
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

let bin: string | undefined;
export function ffmpegPath(): { path: string; source: string } | undefined {
  const tryRun = (p: string) => spawnSync(p, ['-version'], { stdio: 'ignore' }).status === 0;
  if (process.env.REPOREEL_FFMPEG && tryRun(process.env.REPOREEL_FFMPEG)) return { path: process.env.REPOREEL_FFMPEG, source: 'REPOREEL_FFMPEG' };
  if (tryRun('ffmpeg')) return { path: 'ffmpeg', source: 'PATH' };
  try {
    const p = createRequire(import.meta.url)('ffmpeg-static') as string | null;
    if (p && tryRun(p)) return { path: p, source: 'bundled ffmpeg-static' };
  } catch {}
  return undefined;
}

const exe = () => (bin ??= ffmpegPath()?.path ?? (() => { throw new Error('ffmpeg not found: install it (https://ffmpeg.org/download.html) or run `npm i ffmpeg-static`, then `reporeel setup`'); })());

export const ffmpeg = (args: string[]) => execFileSync(exe(), ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 << 20 });

/** Seconds, from ffmpeg's own header ("Duration: 00:00:09.55"). */
export function duration(file: string): number {
  const r = spawnSync(exe(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = (r.stderr ?? '').match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`could not read the duration of ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}
