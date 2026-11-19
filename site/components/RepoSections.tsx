// The map with its receipts, and the reading order: the part of a repository's page that the landing
// page shows for its demo and /r/ shows for any repository.
import { Suspense } from 'react';
import { Demo } from '@/components/Demo';
import { permalink, type Fixture } from '@/lib/fixture';
import { layout } from '@/lib/layout';
import { receipts } from '@/lib/receipts';

/** Three claims a newcomer meets first: the entry's first two imports, and the widest citation into the heart. */
export function claims(f: Fixture) {
  const fromEntry = f.edges.filter(e => e.from === f.entry).sort((a, b) => a.line - b.line).slice(0, 2);
  const intoHeart = f.edges.filter(e => e.to === f.heart && !fromEntry.includes(e)).sort((a, b) => b.end - b.line - (a.end - a.line)).slice(0, 1);
  const picked = [...fromEntry, ...intoHeart];
  return picked.length ? picked : f.edges.slice(0, 3);
}

export async function RepoMap({ f }: { f: Fixture }) {
  const { list, css } = await receipts(f, claims(f));
  return (
    <>
      <style>{css}</style>
      {/* Its own boundary, so React hydrates the demo in a separate task from the rest of the page. */}
      <Suspense>
        <Demo repo={f.repo} sha={f.sha} nodes={f.nodes} h={layout(f.nodes, f.edges, 'h')} v={layout(f.nodes, f.edges, 'v')} receipts={list} />
      </Suspense>
    </>
  );
}

export function StartHere({ f }: { f: Fixture }) {
  if (!f.startHere.length) return null;
  const minutes = f.startHere.reduce((s, x) => s + x.minutes, 0);
  return (
    <section aria-labelledby="start-title" className="mt-24 md:mt-32">
      <h2 id="start-title" className="font-display text-h2 text-balance">Where to start reading.</h2>
      <p className="mt-4 max-w-[60ch] text-body text-text-2 text-pretty">
        {f.startHere.length} file{f.startHere.length === 1 ? '' : 's'}, about {minutes} minute{minutes === 1 ? '' : 's'}, in the order that makes the rest of {f.repo.split('/')[1]} make sense.
        The minutes come from each file&rsquo;s length.
      </p>
      <ol className="mt-10 grid gap-px overflow-hidden rounded-l border border-border bg-border">
        {f.startHere.map((s, i) => (
          <li key={s.file} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 bg-bg px-4 py-5 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:items-baseline md:px-6">
            <span className="tabular row-span-2 font-display text-h3 text-text-2 md:row-span-1" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <a href={permalink(f, s.file, s.line)} className="break-all rounded-s font-mono text-mono-s text-text underline decoration-border-strong underline-offset-4 transition-colors duration-150 ease-rt hover:decoration-accent">
                {s.file}
              </a>
              <p className="mt-1.5 text-body text-text-2 text-pretty">{s.why}</p>
            </div>
            <span className="tabular mt-2 font-mono text-mono-s text-text-2 md:mt-0">{s.minutes} min</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
