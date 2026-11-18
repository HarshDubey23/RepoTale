// storyboard.json -> narrated MP4, silent GIF preview, captions (.srt), poster, contact sheet and a
// README section. Frames come from Chrome's screencast (crisp JPEGs at full resolution), not from
// Playwright's VP8 recorder, so text in code and UIs stays sharp.
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { check } from './evidence.ts';
import { childEnv, mustApprove, requireDocker, runCommand, within, type Approve, type Sandbox } from './exec.ts';
import { duration, ffmpeg } from './ffmpeg.ts';
import { OVERLAY } from './overlay.ts';
import { validate, type Action, type Scene, type Storyboard } from './storyboard.ts';
import { sceneHtml } from './templates.ts';
import { speak, type Clip } from './voice.ts';

const LEAD = 0.5, TAIL = 0.8, FPS = 30, FADE = 0.2;
/** Bump when recording changes in a way that should invalidate cached scenes. */
const CACHE_VERSION = 3;
const sleep = (ms: number) => new Promise(r => setTimeout(r, Math.max(0, ms)));
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');

export interface RenderOpts {
  out: string;
  log?: (m: string) => void;
  /** Use the say_<lang> narration of every scene. */
  lang?: string;
  /** 1-based scene numbers: render only these into preview.mp4, leaving the full outputs alone. */
  only?: number[];
  /** Ignore cached scenes and record everything again. */
  fresh?: boolean;
  /** Asked once, with every terminal-scene command and app.start, before anything runs. Without it they are refused. */
  approve?: Approve;
  /** Run terminal-scene commands in a container. `app.start` still runs on this machine: the browser has to reach it. */
  sandbox?: Sandbox;
}
export interface Rendered { video: string; gif: string; srt: string; poster: string; sheet: string; readme: string; scenes: { id: string; type: string; title: string; start: number; seconds: number }[] }

/** What a scene is called in chapters and the README. */
function chapterTitle(s: Scene, i: number): string {
  if (s.type === 'title' || s.type === 'end') return s.heading;
  if (s.type === 'code') return s.caption ?? s.file;
  if (s.type === 'diagram') return s.caption ?? 'How it works';
  if (s.type === 'stats') return s.heading ?? 'Numbers';
  if (s.type === 'terminal') return `$ ${s.commands[0]}`.slice(0, 60);
  const words = s.say.split(/\s+/).slice(0, 7).join(' ');
  return words.replace(/[.,;:]$/, '') + (s.say.split(/\s+/).length > 7 ? '…' : '') || `Scene ${i + 1}`;
}

/** Everything that changes how a non-web scene looks or sounds. */
function sceneKey(sb: Storyboard, s: Scene, clip: Clip, env: { size: object; accent: string; repoDir: string }): string {
  const h = createHash('sha256');
  h.update(JSON.stringify([CACHE_VERSION, s, clip, env.size, env.accent, sb.title, sb.repo, sb.theme?.captions]));
  if (clip.file && existsSync(clip.file)) h.update(readFileSync(clip.file));
  if (s.type === 'code' && existsSync(join(env.repoDir, s.file))) h.update(readFileSync(join(env.repoDir, s.file)));
  return h.digest('hex').slice(0, 20);
}

export async function render(sb: Storyboard, file: string, o: RenderOpts): Promise<Rendered> {
  const log = o.log ?? (() => {});
  if (o.lang) {
    const missing = sb.scenes.filter(s => !s[`say_${o.lang}`]).length;
    if (missing) throw new Error(`${missing} scene(s) have no say_${o.lang}; run reporeel dub --lang ${o.lang} first`);
    sb = { ...sb, scenes: sb.scenes.map(s => ({ ...s, say: s[`say_${o.lang}`]! })) };
  }
  const errs = validate(sb);
  if (errs.length) throw new Error('storyboard is not valid:\n  ' + errs.join('\n  '));
  const bad = (o.only ?? []).filter(n => !(n >= 1 && n <= sb.scenes.length));
  if (bad.length) throw new Error(`--only ${bad.join(',')}: the storyboard has scenes 1 to ${sb.scenes.length}`);
  // A storyboard can come from a model that read an untrusted repository: its commands are shown
  // and approved before any of them runs.
  await mustApprove([...sb.scenes.flatMap(s => (s.type === 'terminal' ? s.commands : [])), ...(sb.app?.start && sb.scenes.some(s => s.type === 'web') ? [sb.app.start] : [])], o.approve);
  // A sandbox that was asked for and is not there stops everything; it never quietly becomes the host.
  if (o.sandbox && sb.scenes.some(s => s.type === 'terminal')) requireDocker();
  // `repo` is a folder relative to the storyboard, or an owner/name label; a label means "this folder".
  const candidate = resolve(file, '..', sb.repo ?? '.');
  const repoDir = existsSync(candidate) ? candidate : resolve(file, '..');
  // A citation that does not resolve is a wrong video; find out before recording, not after.
  const evidence = check(sb, repoDir);
  const broken = evidence.scenes.filter(s => s.status === 'broken');
  if (broken.length) throw new Error('the storyboard cites things that are not in the repository:\n  ' + broken.flatMap(s => s.problems.map(p => `scene ${s.scene} (${s.type}): ${p}`)).join('\n  '));
  const loose = evidence.scenes.filter(s => s.status === 'unsupported');
  if (loose.length) log(`warning: scene(s) ${loose.map(s => s.scene).join(', ')} cite no evidence; see reporeel check`);
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
      const r = runCommand(cmd, { repoDir, cwd: s.cwd, timeoutMs: s.timeoutMs ?? 120_000, env: { FORCE_COLOR: '0', CI: '1' }, sandbox: o.sandbox });
      const lines = stripAnsi(r.out).trimEnd().split('\n');
      // A failure is reported, never hidden: the scene shows the exit code and the log says it too.
      log(`  ran: ${cmd} → ${r.timedOut ? `timed out after ${(s.timeoutMs ?? 120_000) / 1000}s` : `exit ${r.code}`} (${lines.length} lines)`);
      return { cmd, code: r.code, timedOut: r.timedOut, out: (lines.length > 16 ? ['…', ...lines.slice(-15)] : lines).join('\n') };
    });
  }

  let app: ChildProcess | undefined;
  if (sb.scenes.some(s => s.type === 'web') && sb.app?.start) {
    if (o.sandbox) log('warning: app.start runs on this machine, outside the sandbox, so the browser can reach it');
    try { app = await startApp(sb.app, repoDir, log); }
    catch (e) {
      // The rest of the video is still worth having; say clearly what was left out.
      log(`warning: ${(e as Error).message}. Leaving out ${sb.scenes.filter(s => s.type === 'web').length} web scene(s).`);
      const keep = sb.scenes.map(s => s.type !== 'web');
      sb = { ...sb, scenes: sb.scenes.filter((_, i) => keep[i]) };
      clips.splice(0, clips.length, ...clips.filter((_, i) => keep[i]));
    }
  }
  let browser: Browser;
  try { browser = await chromium.launch(); }
  catch (e) { app?.kill('SIGTERM'); throw new Error(`Playwright could not start Chromium. Run \`reporeel setup --fix\`.\n${(e as Error).message.split('\n')[0]}`); }
  const segs: string[] = [], timeline: Rendered['scenes'] = [];
  const cacheDir = join(out, '.cache', 'scenes');
  mkdirSync(cacheDir, { recursive: true });
  let t = 0, reused = 0;
  try {
    for (const [i, s] of sb.scenes.entries()) {
      if (o.only && !o.only.includes(i + 1)) continue;
      const planned = Math.max(s.type === 'web' ? 3.5 : 3, clips[i].seconds + LEAD + TAIL);
      const seg = join(work, `seg${String(i).padStart(3, '0')}.mp4`);
      // A scene that looks and sounds the same as last time is reused. Web scenes show a live
      // app, so they are always recorded again.
      const key = s.type === 'web' ? undefined : sceneKey(sb, s, clips[i], { size, accent, repoDir });
      const hit = key && !o.fresh && existsSync(join(cacheDir, key + '.mp4')) && existsSync(join(cacheDir, key + '.json'));
      let seconds: number;
      if (hit) {
        copyFileSync(join(cacheDir, key + '.mp4'), seg);
        seconds = JSON.parse(readFileSync(join(cacheDir, key + '.json'), 'utf8')).seconds;
        reused++;
        log(`reusing   ${i + 1}/${sb.scenes.length}: ${s.type} (unchanged)`);
      } else {
        log(`recording ${i + 1}/${sb.scenes.length}: ${s.type}${s.id ? ' ' + s.id : ''} (${planned.toFixed(1)}s)`);
        seconds = await recordScene(browser, sb, s, planned, clips[i], seg, { size, accent, repoDir, work: join(work, `f${i}`) });
        if (key) { copyFileSync(seg, join(cacheDir, key + '.mp4')); writeFileSync(join(cacheDir, key + '.json'), JSON.stringify({ seconds })); }
      }
      segs.push(seg);
      timeline.push({ id: s.id ?? `${i + 1}-${s.type}`, type: s.type, title: chapterTitle(s, i), start: t, seconds });
      t += seconds;
    }
  } finally {
    await browser.close();
    app?.kill('SIGTERM');
  }
  if (reused) log(`reused ${reused} unchanged scene(s); pass --fresh to record everything again`);

  if (o.only) {
    const preview = join(out, 'preview.mp4');
    writeFileSync(join(work, 'segs.txt'), segs.map(s => `file '${s}'`).join('\n'));
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(work, 'segs.txt'), '-c', 'copy', '-movflags', '+faststart', preview]);
    rmSync(work, { recursive: true, force: true });
    log(`preview of scene(s) ${o.only.join(', ')}: ${preview}`);
    return { video: preview, gif: '', srt: '', poster: '', sheet: '', readme: '', scenes: timeline };
  }

  log('assembling');
  const video = join(out, 'reporeel.mp4');  // per-language renders go to their own --out folder
  writeFileSync(join(work, 'segs.txt'), segs.map(s => `file '${s}'`).join('\n'));
  // Chapters, so players (and YouTube, from the description) can jump to each scene.
  const esc = (x: string) => x.replace(/[=;#\\\n]/g, m => (m === '\n' ? ' ' : '\\' + m));
  writeFileSync(join(work, 'chapters.txt'), ';FFMETADATA1\ntitle=' + esc(sb.title) + '\n' + timeline.map(c =>
    `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round((c.start + c.seconds) * 1000)}\ntitle=${esc(c.title)}`).join('\n') + '\n');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(work, 'segs.txt'), '-i', join(work, 'chapters.txt'), '-map', '0', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', video]);

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
  // What this video cites, at which commit: `reporeel check` compares it with the code later.
  writeFileSync(join(out, 'evidence.json'), JSON.stringify(evidence, null, 1) + '\n');
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

### Chapters

${tl.map(c => `${mmss(c.start)} ${c.title}`).join('\n')}
`;
}

/** Runs `app.start`. Callers get approval first (render does; see mustApprove). */
export async function startApp(app: NonNullable<Storyboard['app']>, cwd: string, log: (m: string) => void) {
  // A fresh clone has no dependencies yet: install them where the start command will run.
  const dir = resolve(cwd, app.start!.match(/^cd\s+([^\s&;]+)\s*&&/)?.[1] ?? '.');
  if (!within(cwd, dir)) throw new Error(`app.start changes into ${dir}, which is outside the repository`);
  if (existsSync(join(dir, 'package.json')) && !existsSync(join(dir, 'node_modules'))) {
    log(`installing dependencies in ${dir}`);
    execSync(existsSync(join(dir, 'package-lock.json')) ? 'npm ci' : 'npm install', { cwd: dir, stdio: 'ignore', timeout: 600_000, env: childEnv() });
  }
  log(`starting app: ${app.start}`);
  const p = spawn(app.start!, { cwd, shell: true, stdio: 'ignore', detached: false, env: childEnv({ BROWSER: 'none' }) });
  const until = Date.now() + (app.readyTimeoutMs ?? 90_000);
  while (Date.now() < until) {
    try { if ((await fetch(app.url)).status < 500) return p; } catch {}
    await sleep(500);
  }
  p.kill();
  throw new Error(`app did not answer at ${app.url} within ${(app.readyTimeoutMs ?? 90_000) / 1000}s`);
}

interface Env { size: { width: number; height: number }; accent: string; repoDir: string; work: string }

async function recordScene(browser: Browser, sb: Storyboard, s: Scene, seconds: number, clip: Clip, seg: string, env: Env): Promise<number> {
  // A web scene starts from the saved sign-in, so pages behind a login render as the signed-in user sees them.
  const session = s.type === 'web' && sb.app?.session ? join(env.repoDir, sb.app.session) : undefined;
  const ctx = await browser.newContext({ viewport: env.size, deviceScaleFactor: 1, colorScheme: 'dark', ...(session && existsSync(session) ? { storageState: session } : {}) });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  mkdirSync(env.work, { recursive: true });
  if (s.type === 'web') {
    await page.goto(new URL(s.url ?? '/', sb.app?.url ?? s.url).href, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => page.waitForLoadState('load'));
  } else {
    const html = join(env.work, 'scene.html');
    writeFileSync(html, await sceneHtml(s, { accent: env.accent, seconds: seconds - LEAD, repo: /^[\w.-]+\/[\w.-]+$/.test(sb.repo ?? '') ? sb.repo! : env.repoDir.split('/').pop()!, repoDir: env.repoDir, title: sb.title }));
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
  // A scene lasts as long as its narration or its actions, whichever is longer: an app that is
  // still working when the voice stops keeps the camera on it.
  if (s.type === 'web') await play(page, s.actions ?? [], seconds);
  seconds = Math.max(seconds, Date.now() / 1000 - t0 + TAIL);
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
    // A short dip between scenes; the audio gets a few milliseconds of fade so cuts never click.
    '-filter_complex', `[0:v]fps=${FPS},scale=${env.size.width}:${env.size.height}:flags=lanczos,format=yuv420p,fade=t=in:st=0:d=${FADE},fade=t=out:st=${(seconds - FADE).toFixed(3)}:d=${FADE}[v];[1:a]adelay=${Math.round(LEAD * 1000)}:all=1,apad,aresample=44100,aformat=channel_layouts=stereo,afade=t=in:d=0.03,afade=t=out:st=${(seconds - 0.05).toFixed(3)}:d=0.05[a]`,
    '-map', '[v]', '-map', '[a]', '-t', seconds.toFixed(3), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', seg]);
  rmSync(env.work, { recursive: true, force: true });
  return seconds;
}

/** Runs the scene's actions spread across its narration, with a visible cursor. */
async function play(page: Page, actions: Action[], seconds: number) {
  const timed = actions.filter(a => !('wait' in a) && !('waitFor' in a)).length || 1;
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
          if ('type' in a) { await rr('ripple', x, y); await el.click(); await el.pressSequentially(a.type[1], { delay: Math.min(55, 1600 / Math.max(1, a.type[1].length)) }); }
        }
        if ('press' in a) await page.keyboard.press(a.press);
      }
    } catch (e) {
      // A missing element should not kill a 2-minute render; it is reported and the scene goes on.
      console.warn(`  action ${JSON.stringify(a)} failed: ${(e as Error).message.split('\n')[0]}`);
    }
    if (!('waitFor' in a)) await sleep(slot - (Date.now() - start));
    if (zoomed) { await rr('zoom', { x: 0, y: 0, width: 0, height: 0 }); zoomed = false; }
  }
}
