'use server';
// The Verification Report's server half: the cited files fetched at the commit the repository page was read
// at, then web/insight.js verifyCitations, the same check the static site runs on a model's answer.
// Files come from raw.githubusercontent.com, which does not count against GitHub's hourly API limit.
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { langOf, symbolsOf } from '../../web/analyze.js';
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { verifyCitations } from '../../web/insight.js';
import { repository } from './engine';
import { CITE, LEVELS, MAX_TEXT, judge, segments, type Check, type Level, type Segment } from './trust';

export interface Item { label: string; file: string; start: number | null; end: number | null; level: Level; why: string; href: string; found: string[]; lines: { n: number; text: string }[] }
export type Report =
  | { ok: true; text: string; sha: string; segments: Segment[]; items: Item[]; counts: Record<Level, number> }
  | { ok: false; text: string; message: string };


const MAX_FILES = 30, MAX_BYTES = 1_000_000, SHOWN = 12;
const SAFE = /^(?!\/)(?!.*(^|\/)\.\.?(\/|$))[\w./@+-]+$/;

type Fetched = { text: string } | { missing: true } | { unreachable: true };

async function fetchFile(repo: string, sha: string, file: string): Promise<Fetched> {
  if (!SAFE.test(file)) return { missing: true };
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${file.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(8000), cache: 'force-cache' });
    if (r.status === 404) return { missing: true };
    if (!r.ok) return { unreachable: true };
    const text = await r.text();
    return text.length > MAX_BYTES ? { unreachable: true } : { text: text.replace(/\r\n/g, '\n') };
  } catch {
    return { unreachable: true };
  }
}

/** Checks every citation in `text` against owner/name at the commit its page was read at. */
export async function verify(owner: string, name: string, _prev: Report | null, form: FormData): Promise<Report> {
  const text = String(form.get('text') ?? '').slice(0, MAX_TEXT);
  if (!text.trim()) return { ok: false, text, message: 'Paste the explanation you want checked first.' };
  if (!text.match(CITE)) return { ok: false, text, message: 'No citations found. RepoTale checks citations written like [src/index.ts:12] or [src/index.ts:12-20].' };

  const r = await repository(owner, name);
  if (!r.ok) return { ok: false, text, message: r.failure.message };
  const { repo, sha, url } = r.repo;

  const files = [...new Set([...text.matchAll(CITE)].flatMap(m => m[1] ? [m[1]] : []))];
  if (files.length > MAX_FILES) return { ok: false, text, message: `This cites ${files.length} files; RepoTale checks up to ${MAX_FILES} at a time. Split it into smaller parts.` };
  const got = new Map(await Promise.all(files.map(async f => [f, await fetchFile(repo, sha, f)] as const)));

  const modules = [...got].flatMap(([file, g]) => 'text' in g ? [{ file, text: g.text, lines: g.text.split('\n').length, symbols: symbolsOf(g.text, langOf(file)) }] : []);
  const byFile = new Map(modules.map(m => [m.file, m]));
  const checks: Check[] = verifyCitations(text, { modules });

  const items = checks.map((c): Item => {
    const g = got.get(c.file), mod = byFile.get(c.file);
    const { level, why } = judge(c, { missing: !!g && 'missing' in g, unreachable: !!g && 'unreachable' in g, lines: mod?.lines ?? 0, sha });
    const from = c.start ?? 1, to = Math.min(c.end ?? from, from + SHOWN - 1);
    const lines = c.ok && mod && c.start !== null ? mod.text.split('\n').slice(from - 1, to).map((t, i) => ({ n: from + i, text: t })) : [];
    const anchor = c.ok && c.start !== null ? `#L${c.start}${c.end && c.end > c.start ? `-L${c.end}` : ''}` : '';
    return { label: c.text.slice(1, -1), file: c.file, start: c.start, end: c.end, level, why, lines, found: c.found ?? [], href: `${url}/blob/${sha}/${c.file}${anchor}` };
  });
  const counts = Object.fromEntries(LEVELS.map(l => [l, items.filter(i => i.level === l).length])) as Record<Level, number>;
  return { ok: true, text, sha, segments: segments(text), items, counts };
}
