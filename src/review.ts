// `reporeel review`: what the current branch can break, as Markdown for a pull request's job summary
// or description. The same analysis as the website's Review and the MCP server's `impact`, on the
// working tree: changed files, every file that reaches them through imports, the tests on those
// paths. Static: nothing from the repository is run.
import { execFileSync } from 'node:child_process';
import { localModel } from './mcp.ts';
// @ts-ignore: plain ES module shared with the website, so all three give the same answer
import { prImpact } from '../web/insight.js';

export interface Change { filename: string; status: 'added' | 'removed' | 'modified' | 'renamed'; additions: number; deletions: number }

const git = (root: string, ...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The ref to compare with when none is given: the remote's default branch, else the previous commit. */
export function defaultBase(root: string): string {
  for (const ref of ['origin/HEAD', 'origin/main', 'origin/master']) try { git(root, 'rev-parse', '--verify', '--quiet', ref); return ref; } catch {}
  return 'HEAD~1';
}

/** Files changed between the merge base of `base` and HEAD, as GitHub lists a pull request's files. */
export function changesSince(root: string, base: string): Change[] {
  const range = `${base}...HEAD`;
  const counts = new Map(git(root, 'diff', '--numstat', '-M', range).split('\n').filter(Boolean).map(l => {
    const [a, d, ...p] = l.split('\t');
    // A rename prints "old => new" or "dir/{old => new}"; the new path is the one that exists.
    const path = p.join('\t').replace(/\{[^}]* => ([^}]*)\}/, '$1').replace(/^.* => /, '').replace(/\/\//g, '/');
    return [path, { additions: +a || 0, deletions: +d || 0 }] as const;
  }));
  const kind: Record<string, Change['status']> = { A: 'added', D: 'removed', R: 'renamed' };
  return git(root, 'diff', '--name-status', '-M', range).split('\n').filter(Boolean).map(l => {
    const [s, ...p] = l.split('\t'), filename = p.at(-1)!;
    return { filename, status: kind[s[0]] ?? 'modified', ...(counts.get(filename) ?? { additions: 0, deletions: 0 }) };
  });
}

const VERDICT: Record<string, string> = { high: 'Review carefully', medium: 'Worth a close look', low: 'Low reach' };
const code = (s: string) => '`' + s.replace(/`/g, "'") + '`';

/** The review as Markdown. `base` is any git ref; the comparison starts at its merge base with HEAD. */
export function reviewMarkdown(root: string, base = defaultBase(root)): string {
  const changes = changesSince(root, base);
  const head = git(root, 'rev-parse', '--short', 'HEAD');
  const foot = `\n<sub>Static analysis of imports at ${head}, compared with ${code(base)}; nothing was run. Reach follows imports only, not calls or configuration. Made by [RepoTale](https://github.com/HarshDubey23/RepoTale).</sub>\n`;
  if (!changes.length) return `## RepoTale review\n\nNo files changed between ${code(base)} and HEAD.\n${foot}`;
  const r = prImpact(localModel(root), changes);
  const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`;
  const lines = [
    `## RepoTale review: ${VERDICT[r.level]}`, '',
    r.files.length
      ? `It changes ${n(r.files.length, 'source file')} in ${n(r.changedAreas.length, 'part')} of the code. Through imports, the change reaches ${n(r.dependents.length, 'more source file')}; ${n(r.tests.length, 'test file')} ${r.tests.length === 1 ? 'sits' : 'sit'} on those paths.`
      : 'None of the changed files is source code the import graph covers.',
  ];
  if (r.risks.length) lines.push('', '**Look at these first**', '', ...r.risks.map((x: any) => `- ${code(x.file)}: ${x.why}`));
  else if (r.files.length) lines.push('', 'Nothing here is widely used or untested: the change stays local.');
  if (r.files.length) lines.push('', '| Changed file | Change | Files it reaches | Tests on its path |', '|---|---|---|---|',
    ...r.files.map((f: any) => `| ${code(f.file)} | ${f.status} +${f.additions} −${f.deletions} | ${f.sourceReach} | ${f.tests}${f.tests === 0 && f.sourceReach ? ' ⚠️' : ''} |`));
  if (r.tests.length) lines.push('', `<details><summary>${n(r.tests.length, 'test file')} to run</summary>`, '', ...r.tests.slice(0, 50).map((t: string) => `- ${code(t)}`), r.tests.length > 50 ? `- and ${r.tests.length - 50} more` : '', '</details>');
  if (r.notRead.length) lines.push('', `Not in the import graph (not source code, or removed): ${r.notRead.slice(0, 12).map(code).join(', ')}${r.notRead.length > 12 ? ` and ${r.notRead.length - 12} more` : ''}.`);
  return lines.filter(l => l !== undefined).join('\n') + '\n' + foot;
}
