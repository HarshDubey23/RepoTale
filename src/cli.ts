// reporeel: make a repository understood. Each command does one job; `reporeel` alone runs the
// whole kit and shows the score before and after.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { writeWorkflow } from './ci.ts';
import { cut, FORMATS, type Format } from './cuts.ts';
import { checkSetup, formatSetup } from './setup.ts';
import { doctor, format } from './doctor.ts';
import { mustApprove } from './exec.ts';
import { diagram, shots, socialCard } from './media.ts';
import { draft, planWithClaude, translate } from './plan.ts';
import { launchPosts } from './posts.ts';
import { prStoryboard } from './pr.ts';
import { writeReadme } from './readme.ts';
import { render, startApp } from './render.ts';
import { detect, mermaidFor } from './stack.ts';
import { SCHEMA_URL, type Storyboard } from './storyboard.ts';
import { verify } from './verify.ts';

const args = process.argv.slice(2);
const cmd = args[0] && !args[0].startsWith('--') ? args.shift()! : 'go';
const flag = (name: string, def?: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const on = (name: string) => args.includes(`--${name}`);
const root = resolve(flag('dir', '.')!);
const out = resolve(root, flag('out', 'docs/reporeel')!);
const sbFile = resolve(root, flag('storyboard', 'reporeel.json')!);
const log = (m: string) => process.stderr.write(m + '\n');
const say = (m: string) => process.stdout.write(m + '\n');

// --run approves up front; at a terminal you are shown the commands and asked; otherwise they are refused.
const approve = async (cmds: string[]) => {
  if (on('run')) return true;
  if (!process.stdin.isTTY) return false;
  log(`\nreporeel is about to run these commands in ${root}:\n${cmds.map(c => `    $ ${c}`).join('\n')}`);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try { return /^y(es)?$/i.test((await rl.question('  run them? [y/N] ')).trim()); } finally { rl.close(); }
};

const load = (): Storyboard => {
  if (!existsSync(sbFile)) throw new Error(`no storyboard at ${sbFile}; run reporeel plan first`);
  return JSON.parse(readFileSync(sbFile, 'utf8'));
};
const save = (sb: Storyboard) => writeFileSync(sbFile, JSON.stringify({ $schema: SCHEMA_URL, ...sb }, null, 2) + '\n');
const repoSlug = () => { try { const p = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); const u = typeof p.repository === 'string' ? p.repository : p.repository?.url; return u?.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] ?? basename(root); } catch { return basename(root); } };

const commands: Record<string, { help: string; run: () => Promise<unknown> }> = {
  go: { help: 'run everything: doctor, plan, video, diagram, social, readme, then doctor again', async run() {
    const before = doctor(root);
    say(format(before, `${basename(root)} (before)`));
    if (!existsSync(sbFile)) await commands.plan.run();
    for (const c of ['video', 'diagram', 'social', 'readme'] as const) { log(`\n== ${c}`); await commands[c].run(); }
    const after = doctor(root);
    say(format(after, `${basename(root)} (after)`));
    say(`  first-impression score: ${before.score} → ${after.score}\n`);
  } },
  doctor: { help: 'score the first impression and list fixes (--json, --min N fails below N)', async run() {
    const r = doctor(root);
    say(on('json') ? JSON.stringify(r, null, 1) : format(r, basename(root)));
    if (flag('min') && r.score < +flag('min')!) process.exitCode = 1;
  } },
  verify: { help: 'run the README setup commands on a clean checkout (asks first; --run to allow)', async run() {
    const r = await verify(root, { log, keep: on('keep'), approve });
    say(r.found ? `\n  ${r.ok ? 'quickstart works' : 'quickstart is broken'}: ${r.steps.filter(s => s.ok).length}/${r.steps.length} steps passed` : '\n  no setup commands found in the README');
    const bad = r.steps.find(s => !s.ok);
    if (bad) say(`  failed: $ ${bad.cmd}  (${bad.note})\n${bad.tail.split('\n').map(l => '    ' + l).join('\n')}`);
    if (!r.ok) process.exitCode = 1;
  } },
  plan: { help: 'write reporeel.json (Claude if ANTHROPIC_API_KEY is set, otherwise an offline draft)', async run() {
    const useClaude = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && !on('offline');
    const sb = useClaude ? await planWithClaude(root, { model: flag('model'), log }) : draft(root);
    save(sb);
    say(`wrote ${sbFile}: ${sb.scenes.length} scenes${useClaude ? '' : ' (offline draft: edit it, or set ANTHROPIC_API_KEY, or ask your coding agent to use the reporeel skill)'}`);
  } },
  video: { help: 'render the storyboard: MP4 with chapters, GIF, captions, poster, contact sheet (--only 2,3 to preview scenes, --fresh, --voice kokoro|elevenlabs|none, --lang hi)', async run() {
    const sb = load();
    if (flag('voice')) sb.voice = { ...(sb.voice ?? { provider: 'kokoro' }), provider: flag('voice') as any };
    const lang = flag('lang');
    if (lang && (sb.voice?.provider ?? 'kokoro') === 'kokoro') sb.voice = { provider: 'elevenlabs', voice: sb.voice?.voice?.length === 20 ? sb.voice.voice : undefined };
    const only = flag('only')?.split(',').map(Number);
    const r = await render(sb, sbFile, { out: lang ? join(out, lang) : out, log, lang, only, fresh: on('fresh'), approve });
    say(only ? `preview ${r.video}` : `video ${r.video}\ngif   ${r.gif}\nsheet ${r.sheet}`);
  } },
  dub: { help: 'add a translated narration (--lang hi) with Claude, then render it with ElevenLabs', async run() {
    const lang = flag('lang');
    if (!lang) throw new Error('--lang is required, e.g. --lang hi');
    const sb = load();
    if (sb.scenes.some(s => !s[`say_${lang}`])) { save(await translate(sb, lang, { model: flag('model') })); log(`added say_${lang} to every scene in ${sbFile}`); }
    await commands.video.run();
  } },
  shots: { help: 'screenshots of the running app: desktop and phone, dark and light', async run() {
    const sb = existsSync(sbFile) ? load() : draft(root);
    if (!sb.app?.url) throw new Error('no app url: set "app" in reporeel.json');
    const pages = [...new Set(sb.scenes.flatMap(s => (s.type === 'web' ? [s.url ?? '/'] : [])))];
    const down = sb.app.start && !(await fetch(sb.app.url).then(() => true, () => false));
    if (down) await mustApprove([sb.app.start!], approve);
    const app = down ? await startApp(sb.app, root, log) : undefined;
    try { await shots(sb.app.url, pages.length ? pages : ['/'], join(out, 'shots'), log); } finally { app?.kill(); }
  } },
  diagram: { help: 'architecture diagram (SVG and PNG) from the storyboard, or from the code', async run() {
    const sb = existsSync(sbFile) ? load() : undefined;
    const m = sb?.scenes.find(s => s.type === 'diagram') as { mermaid: string } | undefined;
    const r = await diagram(m?.mermaid ?? mermaidFor(detect(root)), out, sb?.theme?.accent);
    say(`diagram ${r.svg}`);
  } },
  social: { help: 'GitHub social preview (1280x640), vertical and square cuts of the video, and launch-post drafts (--cuts vertical,square|none)', async run() {
    const sb = existsSync(sbFile) ? load() : draft(root);
    const title = sb.scenes.find(s => s.type === 'title') as { heading: string; sub?: string; say: string } | undefined;
    const stats = (sb.scenes.find(s => s.type === 'stats') as { items: { value: string; label: string }[] } | undefined)?.items.map(i => `${i.value} ${i.label}`) ?? [];
    const shot = [join(out, 'shots', 'home-desktop-dark.png'), join(out, 'poster.png')].find(existsSync);
    mkdirSync(out, { recursive: true });
    const tagline = title?.sub ?? title?.say.split(/(?<=\.)\s/)[0] ?? '';
    await socialCard({ title: sb.title, tagline, repo: repoSlug(), accent: sb.theme?.accent, image: shot, stats }, join(out, 'social.png'));
    writeFileSync(join(out, 'LAUNCH.md'), launchPosts(sb, { url: `https://github.com/${repoSlug()}`, tagline, stats }));
    say(`social ${join(out, 'social.png')}  (upload it under Settings → Social preview)\nposts  ${join(out, 'LAUNCH.md')}`);
    const wanted = (flag('cuts', 'vertical,square')!).split(',').filter(f => f in FORMATS) as Format[];
    const video = join(out, 'reporeel.mp4');
    if (wanted.length && existsSync(video)) for (const f of wanted) {
      log(`cutting ${f}`);
      say(`${f.padEnd(6)} ${await cut(video, f, { title: sb.title, tagline, link: `github.com/${repoSlug()}`, accent: sb.theme?.accent, out })}`);
    }
  } },
  readme: { help: 'put the video, chapters and diagram into README.md (between markers; safe to re-run)', async run() {
    say(`updated ${writeReadme(root, out)}`);
  } },
  pr: { help: 'a short video of what the current branch changes (--base ref)', async run() {
    const sb = prStoryboard(root, flag('base'));
    const file = join(out, 'pr', 'storyboard.json');
    mkdirSync(join(out, 'pr'), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...sb, repo: resolve(root) }, null, 2));
    const r = await render({ ...sb, repo: resolve(root), voice: { provider: (flag('voice') as any) ?? 'kokoro' } }, file, { out: join(out, 'pr'), log, approve });
    say(`pr video ${r.video}`);
  } },
  ci: { help: 'add a GitHub Action: doctor and verify on PRs, fresh media on releases', async run() { say(`wrote ${writeWorkflow(root)}`); } },
  setup: { help: 'check node, ffmpeg, Chromium and API keys (--fix installs Chromium)', async run() {
    const items = await checkSetup({ fix: on('fix'), log });
    say(formatSetup(items));
    if (items.some(i => i.required && !i.ok)) process.exitCode = 1;
  } },
  help: { help: 'this list', async run() {
    say(`reporeel: make your repository understood\n\n  reporeel            everything, with the score before and after\n${Object.entries(commands).filter(([k]) => k !== 'go').map(([k, v]) => `  reporeel ${k.padEnd(10)} ${v.help}`).join('\n')}\n\n  common: --run (allow the commands a storyboard or README asks for, without the prompt) --dir <repo> --out <folder, default docs/reporeel> --storyboard <file, default reporeel.json>\n`);
  } },
};

const c = commands[cmd];
if (!c) { log(`unknown command: ${cmd}`); await commands.help.run(); process.exitCode = 1; }
else await c.run().catch(e => { log(`error: ${e.message}`); process.exitCode = 1; });
