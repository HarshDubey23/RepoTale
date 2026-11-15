// End to end: renders the example app's storyboard (live app, code, a real test run) with the silent
// voice and checks every output. Skips, with the reason, if Chromium or ffmpeg is missing.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { ffmpegPath } from '../src/ffmpeg.ts';
import { render } from '../src/render.ts';
import { checkSetup } from '../src/setup.ts';

test('renders the example end to end, then reuses unchanged scenes', { timeout: 300_000 }, async t => {
  const missing = (await checkSetup()).filter(i => i.required && !i.ok);
  if (missing.length) return t.skip(`missing: ${missing.map(m => m.name).join(', ')}`);
  const file = resolve('examples/hello/reporeel.example.json');
  const sb = { ...JSON.parse(readFileSync(file, 'utf8')), voice: { provider: 'none' } };
  const out = mkdtempSync(join(tmpdir(), 'rr-e2e-'));
  const r = await render(sb, file, { out });

  for (const f of [r.video, r.gif, r.srt, r.poster, r.sheet, r.readme]) assert.ok(existsSync(f), f);
  assert.equal(r.scenes.length, 5);
  const total = r.scenes.reduce((s, c) => s + c.seconds, 0);
  const info = spawnSync(ffmpegPath()!.path, ['-hide_banner', '-i', r.video], { encoding: 'utf8' }).stderr;
  const [, h, m, s] = info.match(/Duration: (\d+):(\d+):([\d.]+)/)!;
  assert.ok(Math.abs(+h * 3600 + +m * 60 + +s - total) < 0.5, 'video length matches the timeline');
  assert.equal(info.match(/Chapter #/g)?.length, 5, 'one chapter per scene');
  assert.match(readFileSync(r.srt, 'utf8'), /Readable tells you how long/);

  // Second run: the four non-web scenes come from the cache; the live app scene is recorded again.
  const lines: string[] = [];
  await render(sb, file, { out, log: l => lines.push(l) });
  assert.equal(lines.filter(l => l.startsWith('reusing')).length, 4);
  assert.equal(lines.filter(l => l.startsWith('recording')).length, 1);
});
