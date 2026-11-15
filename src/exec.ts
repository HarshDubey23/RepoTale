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

/** Throws, listing the commands, unless `approve` says yes. No commands means nothing to ask. */
export async function mustApprove(cmds: string[], approve?: Approve): Promise<void> {
  if (!cmds.length || (await approve?.(cmds)) === true) return;
  throw new Error(`not run, because these commands were not approved:\n${cmds.map(c => `    $ ${c}`).join('\n')}\n  read them, then pass --run to allow them (library: the \`approve\` option)`);
}
