import 'server-only';
// Live pages: RepoTale's engine (the same web/analyze.js the static site runs in the browser) read on the
// server, reduced by lib/shape.ts, and cached by repository so each one is read once a day, not per visit.
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { analyze } from '../../web/analyze.js';
// @ts-expect-error: plain ES module shared with the static site, the CLI and the MCP server
import { startHere } from '../../web/insight.js';
import { archOf } from './arch';
import { buildFilm } from './film';
import type { Fixture } from './fixture';
import { shape, type EngineEdge, type EngineModule, type Reading } from './shape';

interface Model {
  modules: (EngineModule & { text: string; area: string })[]; edges: EngineEdge[];
  meta: { name: string; full: string; description: string; readme: string | null; readmePath: string | null; stars: number; ref: string; sha: string; date: string | null; url: string; sampled: number; truncated: boolean };
  totals: { files: number };
}

/** Why a page could not be built, in words a reader can act on. `kind` picks the page's state. */
export type Failure = { kind: 'missing' | 'empty' | 'limited'; message: string };

/** GitHub's hourly limit, told apart here because production hides thrown messages from error pages. */
export const LIMITED: Failure = { kind: 'limited', message: 'GitHub allows RepoTale a limited number of reads an hour, and they are used up. Try again in a few minutes; nothing on your side needs to change.' };
export const isLimited = (e: unknown) => /rate limit/i.test(e instanceof Error ? e.message : String(e));
export type Result = { ok: true; repo: Fixture } | { ok: false; failure: Failure };

const NAME = /^[\w.-]{1,100}$/;

async function read(owner: string, name: string): Promise<Result> {
  let model: Model;
  try {
    model = await analyze(`${owner}/${name}`, { token: process.env.GITHUB_TOKEN || undefined, publicFiles: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/does not exist|private/i.test(message)) return { ok: false, failure: { kind: 'missing', message: `${owner}/${name} is not a public GitHub repository, or it does not exist.` } };
    throw e; // a rate limit or an outage: thrown, so it is not cached and the next visit reads again
  }
  if (!model.modules.some(m => !m.test)) return { ok: false, failure: { kind: 'empty', message: 'It has no JavaScript, TypeScript, Python or Go source files for RepoTale to map.' } };

  const byFile = new Map(model.modules.map(m => [m.file, m]));
  const reading: Reading = startHere(model);
  const m = model.meta;
  // The architecture levels and the film's script come from the same read, so a repository costs one.
  const arch = archOf(model);
  return {
    ok: true,
    repo: {
      ...shape(model, reading, f => (byFile.get(f)?.text ?? '').split(/\r?\n/), {
        repo: m.full, sha: m.sha, url: m.url, builtAt: new Date().toISOString().slice(0, 10),
        meta: { description: m.description, stars: m.stars, ref: m.ref, date: m.date, read: m.sampled, files: model.totals.files, partial: m.truncated },
      }),
      arch,
      film: buildFilm(model as never, reading as never, arch, { repo: m.full, sha: m.sha, url: m.url, description: m.description, readme: m.readme, readmePath: m.readmePath }),
    },
  };
}

const cached = unstable_cache(read, ['repotale-repo-v9'], { revalidate: 86_400 });

/** A repository's page data. Names are checked before anything is fetched. `cache` makes the page and its
 *  metadata share one read per request, where the data cache alone would let both read a cold repository. */
export const repository = cache(async (owner: string, name: string): Promise<Result> => {
  if (!NAME.test(owner) || !NAME.test(name)) return { ok: false, failure: { kind: 'missing', message: 'That is not a GitHub repository name.' } };
  try {
    return await cached(owner.toLowerCase(), name.toLowerCase());
  } catch (e) {
    if (isLimited(e)) return { ok: false, failure: LIMITED };
    throw e;
  }
});
