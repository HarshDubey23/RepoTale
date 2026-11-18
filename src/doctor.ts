// `reporeel doctor`: what a visitor sees in the first ten seconds, scored, with the fix for each gap.
// Static and offline: it reads the checkout, never runs anything from it.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { within } from './exec.ts';

export interface Check { id: string; area: 'first impression' | 'trust' | 'getting started' | 'safety'; ok: boolean; weight: number; detail: string; fix?: string }
export interface Report { score: number; grade: string; checks: Check[]; readme?: string; secrets: { file: string; line: number; kind: string }[] }

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'venv', '.venv', '__pycache__', 'target', '.cache', 'vendor']);
export const SECRETS: [string, RegExp][] = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}\b/],
  ['OpenAI key', /\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{30,}\b/],
  ['ElevenLabs key', /\bsk_[a-f0-9]{40,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{20,}\b/],
  ['private key', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
];

/** Tracked files when it is a git checkout (that is what visitors see), otherwise a walk. Only files
 *  that are inside the repository once symlinks and junctions are followed: every reader (plan, the
 *  MCP server, graph, doctor) lists through here, so a link to ~/.ssh or a sibling project is never read. */
export function files(dir: string): string[] {
  let all: string[];
  try { all = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); }
  catch {
    all = [];
    const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = join(d, e.name); e.isDirectory() ? walk(p) : all.push(relative(dir, p).replaceAll('\\', '/')); } };
    walk(dir);
  }
  return all.filter(f => within(dir, join(dir, f)));
}

/** A plain sentence in the first lines, skipping the title, badges, images and HTML. */
export const oneLiner = (md: string) => md.split('\n').slice(0, 15)
  .filter(l => l.trim() && !/^\s*(#|<|!\[|\[!\[|```|---|>)/.test(l))
  .some(l => /^[^|].{20,}/.test(l.trim()) && /[a-z]{3,}\s+[a-z]{2,}/i.test(l));

export function doctor(dir: string): Report {
  const all = files(dir);
  const has = (re: RegExp) => all.some(f => re.test(f));
  const readmeFile = all.find(f => /^readme(\.(md|markdown|rst|txt))?$/i.test(f));
  const md = readmeFile ? readFileSync(join(dir, readmeFile), 'utf8') : '';
  const top = md.split('\n').slice(0, 40).join('\n');
  const words = md.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length;
  const heads = [...md.matchAll(/^#{1,3}\s+(.+)$/gm)].map(m => m[1].toLowerCase());
  const section = (re: RegExp) => heads.some(h => re.test(h));
  const codeBlocks = [...md.matchAll(/```(\w*)\n([\s\S]*?)```/g)];
  const media = /!\[[^\]]*\]\([^)]+\.(gif|png|jpe?g|webp|svg|mp4)\)|<img\s|<video\s|user-attachments\/assets/i;
  const pkg = (() => { try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { return undefined; } })();

  // Relative links and images in the README that point at nothing.
  const broken = [...md.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)|src="([^"]+)"/g)]
    .map(m => m[1] ?? m[3])
    .filter(u => u && !/^(https?:|mailto:|data:|#)/.test(u))
    .filter(u => !existsSync(join(dir, decodeURIComponent(u.replace(/^\.\//, '')))));

  const secrets: Report['secrets'] = [];
  for (const f of all) {
    const p = join(dir, f);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.size > 2_000_000 || /\.(png|jpe?g|gif|webp|mp4|zip|gz|woff2?|ttf|pdf|ico|wasm|zkey|lock)$/i.test(f)) continue;
    const text = readFileSync(p, 'utf8');
    if (text.includes('\0')) continue;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const [kind, re] of SECRETS) {
        if (!re.test(line)) continue;
        // A key header alone (in a test that looks for keys, or in docs) is not a key: require key material after it.
        if (kind === 'private key' && !/^[A-Za-z0-9+/=]{40,}\s*$/.test(lines[i + 1] ?? '')) continue;
        secrets.push({ file: f, line: i + 1, kind });
      }
    });
  }
  const envFiles = all.filter(f => /(^|\/)\.env(\.[\w-]+)?$/.test(f) && !/\.(example|sample|template)$/.test(f));
  const bigFiles = all.filter(f => { try { return statSync(join(dir, f)).size > 25_000_000; } catch { return false; } });

  const c = (id: string, area: Check['area'], weight: number, ok: boolean, detail: string, fix?: string): Check => ({ id, area, weight, ok, detail, fix: ok ? undefined : fix });
  const checks: Check[] = [
    c('readme', 'first impression', 12, !!readmeFile, readmeFile ? `${readmeFile}, ${words} words` : 'no README', 'reporeel readme'),
    c('one-liner', 'first impression', 8, oneLiner(top), 'a plain sentence near the top says what this is', 'Add one sentence under the title: what it does and for whom.'),
    c('demo-media', 'first impression', 14, media.test(top), media.test(top) ? 'a GIF, image or video in the first 40 lines' : media.test(md) ? 'media exists but is below the fold' : 'no screenshot, GIF or video', 'reporeel video  (then reporeel readme to place it)'),
    c('how-it-works', 'first impression', 6, (section(/how it works|how it is built|architecture|design|overview|under the hood|internals/) || /<summary>[^<]*(<b>)?\s*(architecture|how it works)/i.test(md)), 'an architecture or "how it works" section', 'reporeel diagram'),
    c('quickstart', 'getting started', 10, section(/install|quick ?start|getting started|setup|usage|run/) && codeBlocks.some(b => /\b(npm|npx|pnpm|yarn|pip|uv|cargo|go |docker|make|brew|curl|git clone|python)\b/.test(b[2])), 'install or quickstart section with a command', 'Add a Quickstart with the exact commands, then run reporeel verify.'),
    c('license', 'trust', 8, has(/^(LICENSE|LICENCE|COPYING)(\.\w+)?$/i), has(/^(LICENSE|LICENCE|COPYING)/i) ? 'license file present' : 'no license: legally, nobody may use this code', 'Add a LICENSE file (MIT is the common default).'),
    c('tests', 'trust', 7, has(/(^|\/)(tests?|__tests__|spec|e2e)\/|(^|\/)(pytest\.ini|conftest\.py|playwright\.config\.\w+|vitest\.config\.\w+|jest\.config\.\w+)$|\.(test|spec)\.\w+$|_test\.(go|py)$|^test_.*\.py$/), 'tests in the repo'),
    c('ci', 'trust', 6, has(/^\.github\/workflows\/.+\.ya?ml$/), 'a GitHub Actions workflow', 'reporeel ci'),
    c('links', 'trust', 5, broken.length === 0, broken.length ? `broken in README: ${broken.slice(0, 5).join(', ')}` : 'every relative link and image resolves'),
    c('contributing', 'trust', 3, has(/^(\.github\/)?CONTRIBUTING(\.md)?$/i) || section(/contribut/), 'a way to contribute is described', 'Add a short Contributing section.'),
    c('metadata', 'first impression', 4, !pkg || (!!pkg.description && !!pkg.repository), pkg ? `package.json: description ${pkg.description ? 'yes' : 'missing'}, repository ${pkg.repository ? 'yes' : 'missing'}` : 'no package manifest to check'),
    c('secrets', 'safety', 12, secrets.length === 0 && envFiles.length === 0,
      secrets.length || envFiles.length ? `${secrets.length} likely secret(s)${envFiles.length ? `, committed ${envFiles.join(', ')}` : ''}` : 'no keys, tokens or .env files committed',
      'Revoke the key first (it is already public), then remove it and rewrite history.'),
    c('large-files', 'safety', 5, bigFiles.length === 0, bigFiles.length ? `over 25 MB: ${bigFiles.join(', ')}` : 'no files over 25 MB', 'Move large files to Git LFS or a release asset.'),
  ];
  const total = checks.reduce((s, k) => s + k.weight, 0);
  const score = Math.round((100 * checks.reduce((s, k) => s + (k.ok ? k.weight : 0), 0)) / total);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  return { score, grade, checks, readme: readmeFile, secrets };
}

export function format(r: Report, name: string): string {
  const col = (n: number, s: string) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
  const lines = [`\n  ${col(1, name)}   ${col(r.score >= 75 ? 32 : r.score >= 50 ? 33 : 31, `${r.score}/100  grade ${r.grade}`)}\n`];
  for (const area of ['first impression', 'getting started', 'trust', 'safety'] as const) {
    lines.push(`  ${col(2, area.toUpperCase())}`);
    for (const k of r.checks.filter(x => x.area === area)) {
      lines.push(`  ${k.ok ? col(32, '✓') : col(31, '✗')} ${k.id.padEnd(14)} ${k.detail}`);
      if (k.fix) lines.push(`    ${col(36, '→ ' + k.fix)}`);
    }
  }
  for (const s of r.secrets.slice(0, 10)) lines.push(`    ${col(31, '!')} ${s.kind} in ${s.file}:${s.line}`);
  return lines.join('\n') + '\n';
}
