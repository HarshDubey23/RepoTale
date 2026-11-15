// `reporeel verify`: do the README's own setup commands work on a clean checkout?
// Runs them in a throwaway clone, in order, and reports the first one that breaks.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { childEnv, mustApprove, type Approve } from './exec.ts';

export interface Step { cmd: string; ok: boolean; seconds: number; note: string; tail: string }

const SHELL_LANGS = /^(bash|sh|shell|console|zsh|)$/;
// Things a README shows but that must not run unattended, or that need the user's own machine.
const SKIP = /^(git clone|cd\s|export\s|source\s|sudo\s|brew\s|open\s|code\s|nano|vim|\$EDITOR)|<[^>]+>|your[-_]|YOUR_|\bxxx\b/;

/** Pulls the commands out of the quickstart-like sections (or all shell blocks, if there are none). */
export function commandsFrom(md: string): string[] {
  // Split on headings, but not on "# comments" inside code fences.
  const sections: string[] = [''];
  let fenced = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && /^#{1,3}\s/.test(line)) sections.push('');
    sections[sections.length - 1] += line + '\n';
  }
  const pick = sections.filter(s => /^#{1,3}\s.*(install|quick ?start|getting started|setup|run|usage|develop)/i.test(s));
  const src = (pick.length ? pick : [md]).join('\n');
  return [...src.matchAll(/```(\w*)\n([\s\S]*?)```/g)]
    .filter(m => SHELL_LANGS.test(m[1].toLowerCase()))
    .flatMap(m => m[2].split('\n'))
    .map(l => l.replace(/^\s*[$>]\s+/, '').trim())
    .filter(l => l && !l.startsWith('#'));
}

/** Runs one command; a server that is still up after `serveAfter` ms counts as started. */
function run(cmd: string, cwd: string, timeoutMs: number, serveAfter: number): Promise<Omit<Step, 'cmd'>> {
  return new Promise(done => {
    const t0 = Date.now(), p = spawn(cmd, { cwd, shell: true, detached: true, env: childEnv({ CI: '1', BROWSER: 'none' }) });
    let out = '';
    const grab = (d: Buffer) => { out = (out + d.toString()).slice(-4000); };
    p.stdout.on('data', grab); p.stderr.on('data', grab);
    const looksLikeServer = /\b(dev|start|serve|preview|up|runserver|uvicorn|flask run|streamlit run)\b/.test(cmd);
    const kill = () => { try { process.kill(-p.pid!, 'SIGTERM'); } catch {} };
    const timer = setTimeout(() => {
      kill();
      const served = looksLikeServer && /(localhost|127\.0\.0\.1|0\.0\.0\.0):\d+|listening|ready|running on/i.test(out);
      done({ ok: served, seconds: (Date.now() - t0) / 1000, note: served ? 'server started' : `still running after ${Math.round((Date.now() - t0) / 1000)}s`, tail: out.trim().split('\n').slice(-12).join('\n') });
    }, looksLikeServer ? serveAfter : timeoutMs);
    p.on('exit', code => {
      clearTimeout(timer);
      done({ ok: code === 0, seconds: (Date.now() - t0) / 1000, note: code === 0 ? 'ok' : `exit ${code}`, tail: out.trim().split('\n').slice(-12).join('\n') });
    });
  });
}

export async function verify(root: string, o: { timeoutMs?: number; log?: (m: string) => void; keep?: boolean; approve?: Approve } = {}) {
  const log = o.log ?? (() => {});
  const readme = ['README.md', 'readme.md'].map(f => join(root, f)).find(f => { try { readFileSync(f); return true; } catch { return false; } });
  if (!readme) throw new Error('no README.md');
  const cmds = commandsFrom(readFileSync(readme, 'utf8'));
  // README text is untrusted input; the clone below is a clean copy, not a sandbox.
  await mustApprove(cmds.filter(c => !SKIP.test(c)), o.approve);
  const dir = mkdtempSync(join(tmpdir(), 'reporeel-verify-'));
  // A clean copy of what is committed: no node_modules, no local .env, no build output.
  execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${root}`, dir]);
  log(`clean checkout in ${dir}`);
  const steps: Step[] = [];
  try {
    for (const cmd of cmds) {
      if (SKIP.test(cmd)) { steps.push({ cmd, ok: true, seconds: 0, note: 'skipped (needs a person or your machine)', tail: '' }); continue; }
      log(`$ ${cmd}`);
      const r = await run(cmd, dir, o.timeoutMs ?? 600_000, 25_000);
      steps.push({ cmd, ...r });
      log(`  ${r.ok ? '✓' : '✗'} ${r.note} (${r.seconds.toFixed(1)}s)`);
      if (!r.ok) break;
    }
  } finally { if (!o.keep) rmSync(dir, { recursive: true, force: true }); }
  return { readme, ok: steps.every(s => s.ok) && steps.length > 0, steps, found: cmds.length };
}
