import 'server-only';
// Live pages: RepoTale's engine (the same web/analyze.js the static site runs in the browser) read on the
// server, reduced by lib/shape.ts, and cached by repository so each one is read once a day, not per visit.
import { unstable_cache } from 'next/cache';
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { analyze } from '../../web/analyze.js';
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { startHere } from '../../web/insight.js';
import type { Fixture } from './fixture';
import { shape, type EngineEdge, type EngineModule, type Reading } from './shape';

interface Model {
  modules: (EngineModule & { text: string })[]; edges: EngineEdge[];
  meta: { full: string; description: string; stars: number; ref: string; sha: string; date: string | null; url: string; sampled: number; truncated: boolean };
  totals: { files: number };
}

/** Why a page could not be built, in words a reader can act on. `kind` picks the page's state. */
export type Failure = { kind: 'missing' | 'empty'; message: string };
export type Result = { ok: true; repo: Fixture } | { ok: false; failure: Failure };

const NAME = /^[\w.-]{1,100}$/;

async function read(owner: string, name: string): Promise<Result> {
  let model: Model;
  try {
    model = await analyze(`${owner}/${name}`, { token: process.env.GITHUB_TOKEN || undefined });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/does not exist|private/i.test(message)) return { ok: false, failure: { kind: 'missing', message: `${owner}/${name} is not a public GitHub repository, or it does not exist.` } };
    if (/rate limit/i.test(message)) throw new Error('GitHub rate limit reached. Try again in a few minutes.'); // not cached: the next visit retries
    throw e;
  }
  if (!model.modules.some(m => !m.test)) return { ok: false, failure: { kind: 'empty', message: 'It has no JavaScript, TypeScript, Python or Go source files for RepoTale to map.' } };

  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const reading: Reading = startHere(model);
  const m = model.meta;
  return {
    ok: true,
    repo: shape(model, reading, f => (byFile.get(f)?.text ?? '').split(/\r?\n/), {
      repo: m.full, sha: m.sha, url: m.url, builtAt: new Date().toISOString().slice(0, 10),
      meta: { description: m.description, stars: m.stars, ref: m.ref, date: m.date, read: m.sampled, files: model.totals.files, partial: m.truncated },
    }),
  };
}

const cached = unstable_cache(read, ['repotale-repo-v4'], { revalidate: 86_400 });

/** A repository's page data. Names are checked before anything is fetched. */
export async function repository(owner: string, name: string): Promise<Result> {
  if (!NAME.test(owner) || !NAME.test(name)) return { ok: false, failure: { kind: 'missing', message: 'That is not a GitHub repository name.' } };
  return cached(owner.toLowerCase(), name.toLowerCase());
}
