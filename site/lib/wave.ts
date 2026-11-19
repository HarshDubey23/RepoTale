// The Risk Wave's data, pure: the files a change reaches through imports, grouped by how many imports away
// they are, and for a risky file one line that imports it. `radius` is the engine's blastRadius (file -> hops).

export interface Band { hops: number; source: string[]; tests: string[] }
interface Mod { file: string; test: boolean }
interface Edge { from: string; to: string; line: number }
type Radius = (file: string, edges: Edge[]) => Map<string, number>;

/** Band 0 is the change itself; then one import away, two, and three or more. Each file sits in the band of
 *  its shortest path from any changed file, and never in two bands. */
export function bands(changed: string[], changedTests: string[], modules: Mod[], edges: Edge[], radius: Radius): Band[] {
  const test = new Map(modules.map(m => [m.file, m.test]));
  const hops = new Map<string, number>();
  for (const f of changed) for (const [g, h] of radius(f, edges)) if ((hops.get(g) ?? Infinity) > h) hops.set(g, h);
  for (const f of [...changed, ...changedTests]) hops.delete(f);
  const band = (n: number, want: (h: number) => boolean): Band => {
    const files = [...hops].filter(([, h]) => want(h)).map(([f]) => f).sort();
    return { hops: n, source: files.filter(f => !test.get(f)), tests: files.filter(f => test.get(f)) };
  };
  return [{ hops: 0, source: [...changed], tests: [...changedTests] }, band(1, h => h === 1), band(2, h => h === 2), band(3, h => h >= 3)];
}

/** A receipt for "this file matters": the first source file, by name, that imports it, and the line. */
export function importLine(file: string, modules: Mod[], edges: Edge[]): { file: string; line: number } | null {
  const test = new Map(modules.map(m => [m.file, m.test]));
  const e = edges.filter(x => x.to === file && !test.get(x.from)).sort((a, b) => a.from.localeCompare(b.from))[0];
  return e ? { file: e.from, line: e.line } : null;
}
