// storyboard.json -> narrated MP4, silent GIF preview, captions (.srt), poster, contact sheet and a
// README section. Frames come from Chrome's screencast (crisp JPEGs at full resolution), not from
// Playwright's VP8 recorder, so text in code and UIs stays sharp.
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { duration, ffmpeg } from './ffmpeg.ts';
import { OVERLAY } from './overlay.ts';
import { validate, type Action, type Scene, type Storyboard } from './storyboard.ts';
import { sceneHtml } from './templates.ts';
import { speak, type Clip } from './voice.ts';

const LEAD = 0.5, TAIL = 0.8, FPS = 30;
const sleep = (ms: number) => new Promise(r => setTimeout(r, Math.max(0, ms)));
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');

export interface RenderOpts { out: string; log?: (m: string) => void; only?: number[] }
export interface Rendered { video: string; gif: string; srt: string; poster: string; sheet: string; readme: string; scenes: { id: string; type: string; start: number; seconds: number }[] }

export async function render(sb: Storyboard, file: string, o: RenderOpts): Promise<Rendered> {
  const log = o.log ?? (() => {});
  const errs = validate(sb);
  if (errs.length) throw new Error('storyboard is not valid:\n  ' + errs.join('\n  '));
  const repoDir = resolve(file, '..', sb.repo ?? '.');
  const out = resolve(o.out), work = join(out, '.work');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const size = sb.size ?? { width: 1280, height: 720 };
  const accent = sb.theme?.accent ?? '#ff7a45';
  const voice = sb.voice ?? { provider: 'kokoro' as const };

  log(`voice: ${voice.provider}`);
  const clips: Clip[] = [];
  for (const [i, s] of sb.scenes.entries()) {
    clips.push(await speak(s.say, voice, join(out, '.cache', 'voice')));
    log(`  scene ${i + 1}/${sb.scenes.length} narration ${clips[i].seconds.toFixed(1)}s`);
  }

  // Terminal scenes run their commands for real, before recording, so the output shown is true.
  for (const s of sb.scenes) if (s.type === 'terminal') {
    (s as any).__runs = s.commands.map(cmd => {
      let outp: string;
      try { outp = execSync(cmd, { cwd: resolve(repoDir, s.cwd ?? '.'), timeout: s.timeoutMs ?? 120_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0', CI: '1' } }); }
      catch (e: any) { outp = (e.stdout ?? '') + (e.stderr ?? ''); }
      const lines = stripAnsi(outp).trimEnd().split('\n');
      log(`  ran: ${cmd} (${lines.length} lines)`);
      return { cmd, out: (lines.length > 16 ? ['…', ...lines.slice(-15)] : lines).join('\n') };
    });
  }

  let app: ChildProcess | undefined;
  if (sb.scenes.some(s => s.type === 'web') && sb.app?.start) app = await startApp(sb.app, repoDir, log);
  const browser = await chromium.launch();
  const segs: string[] = [], timeline: Rendered['scenes'] = [];
  let t = 0;
  try {
    for (const [i, s] of sb.scenes.entries()) {
      const seconds = Math.max(s.type === 'web' ? 3.5 : 3, clips[i].seconds + LEAD + TAIL);
      log(`recording ${i + 1}/${sb.scenes.length}: ${s.type}${s.id ? ' ' + s.id : ''} (${seconds.toFixed(1)}s)`);
      const seg = join(work, `seg${String(i).padStart(3, '0')}.mp4`);
      await recordScene(browser, sb, s, seconds, clips[i], seg, { size, accent, repoDir, work: join(work, `f${i}`) });
      segs.push(seg);
      timeline.push({ id: s.id ?? `${i + 1}-${s.type}`, type: s.type, start: t, seconds });
      t += seconds;
    }
  } finally {
    await browser.close();
    app?.kill('SIGTERM');
  }

  log('assembling');
  const video = join(out, 'reporeel.mp4');
  writeFileSync(join(work, 'segs.txt'), segs.map(s => `file '${s}'`).join('\n'));
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(work, 'segs.txt'), '-c', 'copy', '-movflags', '+faststart', video]);

  const srt = join(out, 'reporeel.srt');
  const ts = (x: number) => new Date(Math.round(x * 1000)).toISOString().slice(11, 23).replace('.', ',');
  writeFileSync(srt, sb.scenes.map((s, i) => `${i + 1}\n${ts(timeline[i].start + LEAD)} --> ${ts(timeline[i].start + LEAD + clips[i].seconds)}\n${s.say}\n`).join('\n'));

  const poster = join(out, 'poster.png');
  ffmpeg(['-ss', String(Math.min(timeline[0].seconds - 0.3, 2.2)), '-i', video, '-frames:v', '1', poster]);

  // Contact sheet: the middle of every scene, so a person or an agent can review the cut at a glance.
  const sheet = join(out, 'sheet.png');
  const thumbs = timeline.map((sc, i) => { const p = join(work, `thumb${i}.png`); ffmpeg(['-ss', String(sc.start + sc.seconds * 0.6), '-i', video, '-frames:v', '1', '-vf', 'scale=480:-1', p]); return p; });
  const cols = Math.min(4, thumbs.length), rows = Math.ceil(thumbs.length / cols);
  ffmpeg([...thumbs.flatMap(p => ['-i', p]), '-filter_complex',
    `${thumbs.map((_, i) => `[${i}]`).join('')}xstack=inputs=${thumbs.length}:layout=${thumbs.map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}:fill=black`, sheet].concat(thumbs.length === 1 ? [] : []).filter(Boolean));

  // GitHub autoplays GIFs but not videos, so the README gets a short silent preview that links to the MP4.
  const gif = join(out, 'reporeel.gif');
  const gifLen = Math.min(t, 24);
  ffmpeg(['-t', String(gifLen), '-i', video, '-vf', 'fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle', gif]);

  const readme = join(out, 'README-section.md');
  writeFileSync(readme, readmeSection(sb, timeline, clips));
  rmSync(work, { recursive: true, force: true });
  log(`done: ${video} (${duration(video).toFixed(1)}s)`);
  return { video, gif, srt, poster, sheet, readme, scenes: timeline };
}

function readmeSection(sb: Storyboard, tl: Rendered['scenes'], clips: Clip[]) {
  const mmss = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
  return `<a href="docs/reporeel/reporeel.mp4"><img src="docs/reporeel/reporeel.gif" width="800" alt="${sb.title}: narrated walkthrough"></a>

<sub>Silent preview. Click for the narrated video (${mmss(tl.at(-1)!.start + tl.at(-1)!.seconds)}). Captions: [reporeel.srt](docs/reporeel/reporeel.srt).</sub>

### What the video covers

${sb.scenes.map((s, i) => `- **${mmss(tl[i].start)}** ${s.say}`).join('\n')}
`;
}

async function startApp(app: NonNullable<Storyboard['app']>, cwd: string, log: (m: string) => void) {
  log(`starting app: ${app.start}`);
  const p = spawn(app.start!, { cwd, shell: true, stdio: 'ignore', detached: false, env: { ...process.env, BROWSER: 'none' } });
  const until = Date.now() + (app.readyTimeoutMs ?? 90_000);
  while (Date.now() < until) {
    try { if ((await fetch(app.url)).status < 500) return p; } catch {}
    await sleep(500);
  }
  p.kill();
  throw new Error(`app did not answer at ${app.url} within ${(app.readyTimeoutMs ?? 90_000) / 1000}s`);
}

interface Env { size: { width: number; height: number }; accent: string; repoDir: string; work: string }

async function recordScene(browser: Browser, sb: Storyboard, s: Scene, seconds: number, clip: Clip, seg: string, env: Env) {
  const ctx = await browser.newContext({ viewport: env.size, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  mkdirSync(env.work, { recursive: true });
  if (s.type === 'web') {
    await page.goto(new URL(s.url ?? '/', sb.app?.url ?? s.url).href, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => page.waitForLoadState('load'));
  } else {
    const html = join(env.work, 'scene.html');
    writeFileSync(html, await sceneHtml(s, { accent: env.accent, seconds: seconds - LEAD, repo: sb.repo && sb.repo !== '.' ? sb.repo : env.repoDir.split('/').pop()!, repoDir: env.repoDir, title: sb.title }));
    await page.goto('file://' + html);
    if (s.type === 'diagram') await page.waitForFunction(() => (window as any).__ready, null, { timeout: 30_000 });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(([a]) => { (window as any).__rr.boot(); (window as any).__rr.accent(a); if (location.protocol === 'file:') (window as any).__rr.hideCursor(); }, [env.accent]);

  // Start capturing, then play the scene.
  const cdp = await ctx.newCDPSession(page);
  const frames: { file: string; t: number }[] = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = join(env.work, `${String(n++).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: env.size.width, maxHeight: env.size.height, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  if (sb.theme?.captions !== false) setTimeout(() => page.evaluate(([txt, sec]) => (window as any).__rr.caption(txt, sec), [s.say, clip.seconds] as const).catch(() => {}), LEAD * 1000);
  if (s.type === 'web') await play(page, s.actions ?? [], seconds);
  await sleep((t0 + seconds) * 1000 - Date.now());
  await cdp.send('Page.stopScreencast').catch(() => {});
  await sleep(100);
  await ctx.close();

  // Variable-rate frames -> constant 30 fps, with the narration placed after the lead-in.
  if (!frames.length) throw new Error(`scene "${s.type}" produced no frames`);
  const list = frames.map((f, i) => {
    const end = i + 1 < frames.length ? frames[i + 1].t : t0 + seconds;
    const start = i === 0 ? t0 : f.t;
    return `file '${f.file}'\nduration ${Math.max(1 / FPS, end - start).toFixed(4)}`;
  }).join('\n') + `\nfile '${frames.at(-1)!.file}'`;
  writeFileSync(join(env.work, 'frames.txt'), list);
  const audio = clip.file ? ['-i', clip.file] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(env.work, 'frames.txt'), ...audio,
    '-filter_complex', `[0:v]fps=${FPS},scale=${env.size.width}:${env.size.height}:flags=lanczos,format=yuv420p[v];[1:a]adelay=${Math.round(LEAD * 1000)}:all=1,apad,aresample=44100,aformat=channel_layouts=stereo[a]`,
    '-map', '[v]', '-map', '[a]', '-t', seconds.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', seg]);
  rmSync(env.work, { recursive: true, force: true });
}

/** Runs the scene's actions spread across its narration, with a visible cursor. */
async function play(page: Page, actions: Action[], seconds: number) {
  const timed = actions.filter(a => !('wait' in a)).length || 1;
  const slot = Math.max(900, ((seconds - LEAD - TAIL) * 1000) / timed);
  await sleep(LEAD * 1000);
  let zoomed = false;
  const box = async (sel: string) => {
    const el = page.locator(sel).first();
    await el.waitFor({ state: 'visible', timeout: 10_000 });
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox();
    if (!b) throw new Error(`no box for ${sel}`);
    return { el, b, x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const rr = (fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).__rr[f as string](...(a as unknown[])), [fn, args] as const);
  for (const a of actions) {
    const start = Date.now();
    try {
      if ('wait' in a) { await sleep(a.wait); continue; }
      if ('waitFor' in a) await page.locator(a.waitFor).first().waitFor({ state: 'visible', timeout: 30_000 });
      else if ('scroll' in a) {
        if (typeof a.scroll === 'number') await page.evaluate(y => window.scrollBy({ top: y, behavior: 'smooth' }), a.scroll);
        else await page.locator(a.scroll).first().evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      } else if ('zoom' in a) {
        const { b } = await box(a.zoom);
        await rr('zoom', b, 1.7); zoomed = true;
      } else {
        const sel = 'click' in a ? a.click : 'hover' in a ? a.hover : 'type' in a ? a.type[0] : '';
        if (sel) {
          const { el, x, y } = await box(sel);
          await rr('cursorTo', x, y, 650);
          if ('click' in a) { await rr('ripple', x, y); await el.click(); }
          if ('hover' in a) await el.hover();
          if ('type' in a) { await rr('ripple', x, y); await el.click(); await el.pressSequentially(a.type[1], { delay: 55 }); }
        }
        if ('press' in a) await page.keyboard.press(a.press);
      }
    } catch (e) {
      // A missing element should not kill a 2-minute render; it is reported and the scene goes on.
      console.warn(`  action ${JSON.stringify(a)} failed: ${(e as Error).message.split('\n')[0]}`);
    }
    await sleep(slot - (Date.now() - start));
    if (zoomed) { await rr('zoom', { x: 0, y: 0, width: 0, height: 0 }); zoomed = false; }
  }
}
