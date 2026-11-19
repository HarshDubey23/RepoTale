// The committed demo: sindresorhus/ky read by RepoTale's own engine at a pinned commit (see scripts/fixture.ts).
// Every node, import, line number and code excerpt comes from that clone; nothing here is typed in by hand.
import ky from '@/fixtures/ky.json';
import type { ArchData } from './arch';
import type { Film } from './film';

export interface FixtureNode { id: string; label: string; col: number; row: number; rows: number; lines: number; users: number; entry: boolean; heart: boolean }
export interface FixtureEdge { from: string; to: string; line: number; end: number; names: string[]; start: number; code: string[]; verified: boolean }
export interface Fixture {
  repo: string; sha: string; url: string; builtAt: string;
  /** Live pages only: what GitHub says about the repository, and how much of it was read. */
  meta?: { description: string; stars: number; ref: string; date: string | null; read: number; files: number; partial: boolean };
  stats: { modules: number; tests: number; imports: number };
  entry: string; heart: string;
  nodes: FixtureNode[]; edges: FixtureEdge[];
  startHere: { file: string; why: string; minutes: number; line: number }[];
  /** Live pages only: the architecture levels and the film's script, made from the same read. */
  arch?: ArchData; film?: Film;
}

export const demo = ky as Fixture;

/** A permalink to exact lines at the analysed commit, so a citation keeps pointing at what was read. */
export const permalink = (f: Fixture, file: string, line: number, end = line) =>
  `${f.url}/blob/${f.sha}/${file}#L${line}${end > line ? `-L${end}` : ''}`;

/** "source/core/Ky.ts:7-15": how a citation reads. */
export const citeLabel = (file: string, line: number, end = line) => `${file}:${line}${end > line ? `-${end}` : ''}`;
