'use client';
// The Risk Wave: a change, then every file that imports it, one step further out per band, each band
// arriving a beat after the last. Bars are each band's share of the source files read. Motion is CSS (.wave).
import { useEffect, useRef, useState } from 'react';
import type { Band } from '@/lib/wave';

const TITLE = ['Changed', 'Import it directly', 'Two steps out', 'Three or more'];
const SHOW = 5;

/** `blob` is the head commit's file URL prefix, so each file links to the version this read saw. */
export function RiskWave({ bands, sourceFiles, blob }: { bands: Band[]; sourceFiles: number; blob: string }) {
  const ref = useRef<HTMLOListElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <ol ref={ref} data-on={on || undefined} className="wave grid gap-px overflow-hidden rounded-l border border-border bg-border md:grid-cols-4">
      {bands.map((b, i) => {
        const share = sourceFiles ? b.source.length / sourceFiles : 0;
        return (
          <li key={b.hops} className="flex min-w-0 flex-col bg-surface px-4 pb-5 pt-0 md:px-5">
            <span className={`wave-front -mx-4 mb-4 block h-0.5 md:-mx-5 ${i === 0 ? 'bg-accent' : 'bg-unverified'}`} aria-hidden />
            <h3 className="text-small text-text-2">{TITLE[i]}</h3>
            <p className="tabular mt-1 font-display text-h2 leading-none">
              {b.source.length}<span className="ml-2 font-sans text-small text-text-2">source file{b.source.length === 1 ? '' : 's'}</span>
            </p>
            <svg viewBox="0 0 100 4" preserveAspectRatio="none" className="mt-3 h-1 w-full" aria-hidden>
              <rect width="100" height="4" rx="2" className="fill-surface-2" />
              <rect width={Math.max(b.source.length ? 2 : 0, share * 100)} height="4" rx="2" className={i === 0 ? 'fill-accent' : 'fill-unverified'} />
            </svg>
            <ul className="mt-4 flex flex-col gap-1 font-mono text-mono-s">
              {b.source.slice(0, SHOW).map(f => (
                <li key={f} className="truncate"><a href={`${blob}${f}`} title={f} className="rounded-s text-text-2 transition-colors duration-150 ease-rt hover:text-text">{f.split('/').slice(-2).join('/')}</a></li>
              ))}
              {b.source.length > SHOW && <li className="text-text-2">and {b.source.length - SHOW} more</li>}
              {!b.source.length && <li className="text-text-2">{i === 0 ? 'No source files among those read' : 'None'}</li>}
            </ul>
            {b.tests.length > 0 && (
              <p className="mt-auto pt-4 text-small text-verified-text">
                <span className="mr-1.5 inline-block size-1.5 rounded-full bg-verified align-middle" aria-hidden />
                {b.tests.length} test{b.tests.length === 1 ? '' : 's'} {i === 0 ? 'changed' : 'reach this far'}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
