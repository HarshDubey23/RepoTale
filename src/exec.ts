import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
// Every command that comes from a repository (README blocks, storyboard terminal scenes, app.start)
// passes through here: nothing runs without an explicit yes, and what runs never sees credentials.
// This is consent and least privilege, not a sandbox: an approved command still has your user's
// file and network access.

/** Called with the exact commands about to run; anything but `true` means they do not run. */
export type Approve = (cmds: string[]) => boolean | Promise<boolean>;

const SECRET = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH/i;

/** The environment for repository commands: ours, minus anything that looks like a credential.
 *  REPOREEL_PASS_ENV=NAME,NAME lets named variables through for apps that need them to start. */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const pass = new Set((process.env.REPOREEL_PASS_ENV ?? '').split(',').map(s => s.trim()).filter(Boolean));
  return { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => pass.has(k) || !SECRET.test(k))), ...extra };
}

/** Run approved commands in a throwaway container instead of on this machine. */
export interface Sandbox { /** e.g. "node:22-slim" or "python:3.12-slim". */ image: string; /** Default false: no network at all. */ network?: boolean }

/** `docker` arguments that run `cmd` with only `mount` visible (at /work, writable), no host
 *  environment, no network unless asked, no extra privileges, and bounded memory, CPU, processes
 *  and time. The time limit is enforced inside the container, so it dies even if we are killed. */
export function dockerArgs(cmd: string, mount: string, o: Sandbox & { workdir?: string; timeoutMs: number; env?: Record<string, string> }): string[] {
  const pass = (process.env.REPOREEL_PASS_ENV ?? '').split(',').map(s => s.trim()).filter(Boolean);
  // Files the command writes should belong to you, not to root; HOME moves to /tmp because that uid has no home in the image.
  const user = typeof process.getuid === 'function' ? ['--user', `${process.getuid()}:${process.getgid!()}`] : [];
  return ['run', '--rm', '--network', o.network ? 'bridge' : 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--memory', '2g', '--cpus', '2', '--pids-limit', '512', ...user,
    '-v', `${mount}:/work`, '-w', `/work${o.workdir && o.workdir !== '.' ? '/' + o.workdir.replaceAll('\\', '/') : ''}`,
    '-e', 'HOME=/tmp', ...Object.entries(o.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]), ...pass.flatMap(k => ['-e', k]),
    o.image, 'timeout', String(Math.ceil(o.timeoutMs / 1000)), 'sh', '-c', cmd];
}

/** Throws, listing the commands, unless `approve` says yes. No commands means nothing to ask. */
export async function mustApprove(cmds: string[], approve?: Approve): Promise<void> {
  if (!cmds.length || (await approve?.(cmds)) === true) return;
  throw new Error(`not run, because these commands were not approved:\n${cmds.map(c => `    $ ${c}`).join('\n')}\n  read them, then pass --run to allow them (library: the \`approve\` option)`);
}

/** Is `p` inside `root` once symlinks are followed? A path that does not exist yet is judged as written. */
export function within(root: string, p: string): boolean {
  const real = (x: string) => { try { return realpathSync(x); } catch { return resolve(x); } };
  const rel = relative(real(root), real(p));
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

/** What a command really did. `code` is null when it was killed (a timeout, or a signal). */
export interface Ran { cmd: string; code: number | null; timedOut: boolean; out: string }

/** Runs one approved command and keeps everything a viewer needs to judge it: exit code, timeout,
 *  stdout, then stderr. On the host it gets the scrubbed environment; in a sandbox, the container's. */
export function runCommand(cmd: string, o: { repoDir: string; cwd?: string; timeoutMs: number; env?: Record<string, string>; sandbox?: Sandbox }): Ran {
  const dir = resolve(o.repoDir, o.cwd ?? '.');
  if (!within(o.repoDir, dir)) throw new Error(`cwd ${o.cwd} is outside the repository`);
  const r = o.sandbox
    ? spawnSync('docker', dockerArgs(cmd, o.repoDir, { ...o.sandbox, workdir: o.cwd, env: o.env, timeoutMs: o.timeoutMs }), { encoding: 'utf8', timeout: o.timeoutMs + 30_000, maxBuffer: 64 << 20 })
    : spawnSync(cmd, { shell: true, cwd: dir, encoding: 'utf8', timeout: o.timeoutMs, maxBuffer: 64 << 20, env: childEnv(o.env) });
  if (o.sandbox && r.error) throw new Error(`could not run docker: ${r.error.message}`);
  // `timeout` inside the container exits 124; on the host, spawnSync reports ETIMEDOUT.
  const timedOut = (r.error as any)?.code === 'ETIMEDOUT' || (!!o.sandbox && r.status === 124);
  const out = [r.stdout, r.stderr].filter(Boolean).join(r.stdout && !r.stdout.endsWith('\n') ? '\n' : '');
  return { cmd, code: timedOut ? null : r.status, timedOut, out: out || (r.error && !timedOut ? String(r.error.message) : '') };
}

/** Fails before anything runs when a sandbox was asked for and Docker cannot provide one. Never falls back to the host. */
export function requireDocker(): void {
  const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 20_000 });
  if (r.status !== 0) throw new Error(`--sandbox needs a running Docker, and none answered${r.error ? ` (${r.error.message})` : `: ${(r.stderr || '').trim().split('\n')[0]}`}. Nothing was run. Start Docker, or drop --sandbox to run on this machine after approval.`);
}
