// `reporeel pr`: a short video of what a change does, for the people reviewing it. Built from git:
// the commit message, the size of the change, the most-changed code with the new lines lit up, and
// the test run on the result.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze, impact } from './graph.ts';
import type { Scene, Storyboard } from './storyboard.ts';

const git = (root: string, ...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).trim();

export function prStoryboard(root: string, base?: string): Storyboard {
  base ??= (() => { try { return git(root, 'merge-base', 'HEAD', git(root, 'rev-parse', '--abbrev-ref', 'origin/HEAD')); } catch { return 'HEAD~1'; } })();
  const subject = git(root, 'log', '-1', '--format=%s');
  const body = git(root, 'log', '-1', '--format=%b').split('\n').find(l => l.trim() && !/^[\w-]+:\s/.test(l)) ?? '';
  const stat = git(root, 'diff', '--numstat', base, 'HEAD').split('\n').filter(Boolean).map(l => { const [a, d, f] = l.split('\t'); return { f, add: +a || 0, del: +d || 0 }; });
  if (!stat.length) throw new Error(`no changes between ${base} and HEAD`);
  const add = stat.reduce((s, x) => s + x.add, 0), del = stat.reduce((s, x) => s + x.del, 0);
  const code = stat.filter(x => /\.(ts|tsx|js|jsx|py|go|rs|java|sol|rb|php|cs|kt|swift|c|cpp|h)$/.test(x.f) && !/(test|spec)/.test(x.f) && existsSync(join(root, x.f)))
    .sort((a, b) => b.add + b.del - (a.add + a.del)).slice(0, 2);
  const scenes: Scene[] = [
    { type: 'title', heading: subject, sub: body.slice(0, 120) || undefined, say: `This change: ${subject.replace(/^\w+(\(.*?\))?:\s*/, '')}.` },
    { type: 'stats', heading: 'Size of the change', items: [{ value: String(stat.length), label: stat.length === 1 ? 'file changed' : 'files changed' }, { value: `+${add}`, label: 'lines added' }, { value: `−${del}`, label: 'lines removed' }],
      say: `It touches ${stat.length} file${stat.length === 1 ? '' : 's'}, adding ${add} lines and removing ${del}.` },
  ];
  // How far the change reaches, from the import graph: who depends on the changed files, and which tests get to them.
  const reachOf = impact(analyze(root), stat.map(x => x.f));
  const src = reachOf.changed.filter(f => !reachOf.tests.includes(f));
  if (src.length) {
    const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
    scenes.push({ type: 'stats', heading: 'Reach of the change', evidence: [...src, ...reachOf.tests].slice(0, 12).map(id => ({ kind: 'file' as const, id })),
      items: [{ value: String(reachOf.dependents.length), label: reachOf.dependents.length === 1 ? 'module depends on it' : 'modules depend on it' }, { value: String(reachOf.tests.length), label: reachOf.tests.length === 1 ? 'test file reaches it' : 'test files reach it' }],
      say: `${n(reachOf.dependents.length, 'other module imports', 'other modules import')} the changed code, directly or through others. ${reachOf.tests.length ? `${n(reachOf.tests.length, 'test file reaches', 'test files reach')} it.` : 'No test file imports it, so nothing here checks this change.'}` });
  }
  for (const c of code) {
    // New-side line numbers of each hunk, from a zero-context diff.
    const hunks = [...git(root, 'diff', '-U0', base, 'HEAD', '--', c.f).matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)]
      .map(m => [+m[1], +m[1] + Math.max(0, (m[2] === undefined ? 1 : +m[2]) - 1)] as [number, number]).filter(([a, b]) => b >= a);
    if (!hunks.length) continue;
    const total = readFileSync(join(root, c.f), 'utf8').split('\n').length;
    const from = Math.max(1, hunks[0][0] - 4), to = Math.min(total, from + 29);
    const shown = hunks.filter(([a]) => a <= to).map(([a, b]) => [a, Math.min(b, to)] as [number, number]).slice(0, 4);
    scenes.push({ type: 'code', file: c.f, lines: [from, to], highlight: shown, caption: `+${c.add} −${c.del}`,
      say: `The main change is in ${c.f.split('/').pop()!.replace(/\./g, ' dot ')}. The highlighted lines are new.` });
  }
  const pkg = (() => { try { return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { return {}; } })();
  if (pkg.scripts?.test && !/no test specified/.test(pkg.scripts.test)) scenes.push({ type: 'terminal', commands: ['npm test'], say: 'Here are the tests, run on this change.' });
  scenes.push({ type: 'end', heading: 'Ready for review', links: [`${base.slice(0, 7)}…HEAD`], say: 'That is the whole change.' });
  return { title: subject.slice(0, 60), repo: '.', theme: { accent: '#58a6ff' }, scenes };
}
