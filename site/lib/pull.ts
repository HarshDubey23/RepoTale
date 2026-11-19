import 'server-only';
// Pull request pages: the pull request from GitHub, its repository read at the head commit with every changed
// file, and what the import graph says the change reaches (web/insight.js prImpact, the same verdict the CLI
// posts on pull requests). Cached per pull request for an hour, since new commits change the answer.
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { analyze, blastRadius, fetchPull } from '../../web/analyze.js';
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { prImpact } from '../../web/insight.js';
import { LIMITED, isLimited, type Failure } from './engine';
import { bands, importLine, type Band } from './wave';

interface Change { filename: string; status: string; additions: number; deletions: number }
interface Pull { number: number; title: string; url: string; author: string; state: string; base: string; head: { repo: string; sha: string }; files: Change[] }
interface Mod { file: string; test: boolean }
interface Edge { from: string; to: string; line: number }
interface Impact {
  files: { file: string; status: string; additions: number; deletions: number; reach: number; sourceReach: number; tests: number; core: boolean }[];
  dependents: string[]; tests: string[]; risks: { file: string; why: string }[]; level: 'high' | 'medium' | 'low'; notRead: string[]; sampled: boolean;
}

export interface PullView {
  repo: string; number: number; title: string; url: string; author: string; state: string; base: string; headRepo: string; sha: string;
  additions: number; deletions: number; changed: number;
  level: Impact['level']; files: Impact['files']; notRead: string[]; sampled: boolean; sourceFiles: number;
  /** The wave: changed files, then what imports them, one step further each band (3 means three or more). */
  bands: Band[];
  /** Each risk with a receipt: one line in the head commit that imports the risky file. */
  risks: { file: string; why: string; cite: { file: string; line: number } | null }[];
  tests: string[];
}
export type PullResult = { ok: true; pull: PullView } | { ok: false; failure: Failure };

async function read(owner: string, name: string, number: number): Promise<PullResult> {
  const token = process.env.GITHUB_TOKEN || undefined;
  let pull: Pull;
  try {
    pull = await fetchPull({ owner, name, number }, token);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/does not exist|private/i.test(message)) return { ok: false, failure: { kind: 'missing', message: `${owner}/${name} has no public pull request #${number}.` } };
    throw e; // a rate limit or an outage: not cached, the next visit retries
  }
  const model: { modules: Mod[]; edges: Edge[] } = await analyze(`${pull.head.repo}/tree/${pull.head.sha}`, { token, include: pull.files.map(f => f.filename), publicFiles: true });
  const impact: Impact = prImpact(model, pull.files);
  const byFile = new Map(model.modules.map(m => [m.file, m]));

  return {
    ok: true,
    pull: {
      repo: `${owner}/${name}`, number: pull.number, title: pull.title, url: pull.url, author: pull.author, state: pull.state, base: pull.base,
      headRepo: pull.head.repo, sha: pull.head.sha,
      additions: pull.files.reduce((s, f) => s + (f.additions ?? 0), 0), deletions: pull.files.reduce((s, f) => s + (f.deletions ?? 0), 0), changed: pull.files.length,
      level: impact.level, files: impact.files, notRead: impact.notRead, sampled: impact.sampled, sourceFiles: model.modules.filter(m => !m.test).length,
      bands: bands(impact.files.map(f => f.file), pull.files.map(f => f.filename).filter(f => byFile.get(f)?.test), model.modules, model.edges, blastRadius),
      risks: impact.risks.map(r => ({ ...r, cite: importLine(r.file, model.modules, model.edges) })),
      tests: impact.tests.sort(),
    },
  };
}

const cached = unstable_cache(read, ['repotale-pull-v1'], { revalidate: 3600 });
const NAME = /^[\w.-]{1,100}$/;

export const pullRequest = cache(async (owner: string, name: string, number: string): Promise<PullResult> => {
  const n = Number(number);
  if (!NAME.test(owner) || !NAME.test(name) || !Number.isInteger(n) || n < 1) return { ok: false, failure: { kind: 'missing', message: 'That is not a GitHub pull request address.' } };
  try {
    return await cached(owner.toLowerCase(), name.toLowerCase(), n);
  } catch (e) {
    if (isLimited(e)) return { ok: false, failure: LIMITED };
    throw e;
  }
});
