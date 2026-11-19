// The trust layer for a pasted explanation: each [file:line] citation, as web/insight.js verifyCitations
// checked it, put on one of four levels. Pure, so the self-checks can run it without a network.
import type { Fixture } from './fixture';

export type Level = 'verified' | 'inferred' | 'unverified' | 'invented';
export const LEVELS: Level[] = ['verified', 'inferred', 'unverified', 'invented'];
/** The longest explanation checked at once, in characters. */
export const MAX_TEXT = 20_000;

/** How each level reads and looks. Class names are whole strings so Tailwind finds them. */
export const TRUST: Record<Level, { word: string; tone: string; fill: string; chip: string; means: string }> = {
  verified: { word: 'Verified', tone: 'text-verified-text', fill: 'fill-verified bg-verified', chip: 'border-verified/50 bg-verified/10 text-verified-text', means: 'The cited lines hold everything the sentence names.' },
  inferred: { word: 'Inferred', tone: 'text-inferred-text', fill: 'fill-inferred bg-inferred', chip: 'border-inferred/50 bg-inferred/10 text-inferred-text', means: 'The cited lines hold some of it; the rest is the writer’s reading.' },
  unverified: { word: 'Unverified', tone: 'text-unverified-text', fill: 'fill-unverified bg-unverified', chip: 'border-unverified/50 bg-unverified/10 text-unverified-text', means: 'The lines exist, but nothing in them confirms the sentence.' },
  invented: { word: 'Invented', tone: 'text-invented-text', fill: 'fill-invented bg-invented', chip: 'border-invented/50 bg-invented/10 text-invented-text line-through decoration-1', means: 'The file or the lines are not there at this commit.' },
};

/** What verifyCitations returns for one citation. */
export interface Check {
  text: string; file: string; start: number | null; end: number | null; ok: boolean;
  support: 'matches' | 'partial' | 'missing' | 'none' | null; names: string[]; found: string[];
}

/** The same pattern verifyCitations reads citations with, so the text splits where the checks are. */
export const CITE = /\[([\w./@+-]+\.[a-z]+)(?::(\d+)(?:-(\d+))?)?\]/gi;

const list = (xs: string[]) => xs.slice(0, 3).map(x => `\`${x}\``).join(', ') + (xs.length > 3 ? ` and ${xs.length - 3} more` : '');

/** A citation's level and the reason, in words. `missing` is a file that is not at the commit; `unreachable`
 *  is one GitHub did not return, which says nothing about the claim, so it is never called invented. */
export function judge(c: Check, how: { missing: boolean; unreachable: boolean; lines: number; sha: string }): { level: Level; why: string } {
  if (how.unreachable) return { level: 'unverified', why: 'GitHub did not return this file just now, so nothing was checked. Try again.' };
  if (how.missing) return { level: 'invented', why: `No file at this path at commit ${how.sha.slice(0, 7)}.` };
  if (!c.ok) return { level: 'invented', why: `The file has ${how.lines} lines; the citation points outside them.` };
  const absent = c.names.filter(n => !c.found.includes(n));
  if (c.support === 'matches') return { level: 'verified', why: `The cited lines contain ${list(c.found)}, everything the sentence names.` };
  if (c.support === 'partial') return { level: 'inferred', why: `The cited lines contain ${list(c.found)}, but not ${list(absent)}.` };
  if (c.support === 'missing') return { level: 'unverified', why: `The lines exist, but none of what the sentence names (${list(absent)}) is in them.` };
  return { level: 'unverified', why: 'The lines exist, but the sentence names no code they could confirm.' };
}

export type Segment = { text: string } | { cite: number };

/** The text cut into plain runs and citations, numbered in the order verifyCitations returns them. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let at = 0, n = 0;
  for (const m of text.matchAll(CITE)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ cite: n++ });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** A sample written from the repository's own imports: one claim its lines support, one that adds a name
 *  they do not hold, one that points past the end of a file. The page says two of them are wrong on purpose. */
export function sample(f: Fixture): string {
  const named = f.edges.filter(e => e.names.length);
  const [a, b] = [named[0], named.find(e => e.from !== named[0]?.from) ?? named[1]];
  const longest = [...f.nodes].sort((x, y) => y.lines - x.lines)[0];
  const out: string[] = [];
  if (a) out.push(`The entry point pulls in \`${a.names[0]}\` [${a.from}:${a.line}].`);
  if (b) out.push(`It wires \`${b.names[0]}\` together with \`retryWithBackoff\` [${b.from}:${b.line}].`);
  if (longest) out.push(`Errors are logged at the bottom of the largest module [${longest.id}:${longest.lines + 40}].`);
  return out.join(' ');
}
