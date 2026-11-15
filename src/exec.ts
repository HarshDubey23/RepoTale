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
