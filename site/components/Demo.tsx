'use client';
// The Assembly: the demo repository's import map builds itself one file at a time, each import drawn as
// its second file lands. The motion is CSS (.asm in globals.css): transitions on the compositor, with React
// flipping one attribute, so the page hydrates fast on a phone. The Receipts: each claim opens to the code
// it cites, and the map lights the import.
import { ArrowUpRight, Check, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FixtureNode } from '@/lib/fixture';
import type { Layout, Orientation } from '@/lib/layout';
import type { Receipt } from '@/lib/receipts';

const STEP = 420; // --dur-3: one file per beat; the CSS delays use the same token

// Hydrates as "motion allowed" like the server render, then switches: no mismatch for reduced-motion readers.
const QUERY = '(prefers-reduced-motion: reduce)';
const onMotionPref = (f: () => void) => { const q = matchMedia(QUERY); q.addEventListener('change', f); return () => q.removeEventListener('change', f); };
const useReducedMotion = () => useSyncExternalStore(onMotionPref, () => matchMedia(QUERY).matches, () => false);
const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const short = (file: string) => file.replace(/^(src|source|lib)\//, '').replace(/\.[a-z]+$/, '');

interface Props { repo: string; sha: string; nodes: FixtureNode[]; h: Layout; v: Layout; receipts: Receipt[] }

export function Demo({ repo, sha, nodes, h, v, receipts }: Props) {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(receipts[0]?.id ?? '');
  const order = [...nodes].sort((a, b) => a.col - b.col || a.row - b.row).map(n => n.id);
  const count = order.length;

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The counter follows the CSS: file n lands n - 1 beats after the build starts.
  useEffect(() => {
    if (!inView || reduce || step >= count) return;
    const t = setTimeout(() => setStep(step + 1), step === 0 ? 0 : STEP);
    return () => clearTimeout(t);
  }, [inView, reduce, step, count]);

  const shown = reduce ? count : step;
  const done = shown >= count;
  const built = reduce || done ? 'done' : inView ? 'building' : undefined;
  const imports = h.wires.length, verified = h.wires.filter(w => w.verified).length;
  const label = new Map(nodes.map(n => [n.id, n.label]));
  const shared = { nodes, order, active };

  return (
    <>
      <figure className="rounded-l border border-border bg-surface shadow-rt" aria-labelledby="map-caption">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 md:px-6">
          <span className="font-mono text-mono-s text-text-2">{repo} <span className="text-text-3" aria-hidden>@</span> {sha.slice(0, 7)}</span>
          <span className="tabular font-mono text-mono-s text-text-2" aria-hidden>
            {done ? <>{n(count, 'module')} <Dot /> {n(imports, 'import')} <Dot /> <span className="text-verified-text">{verified} verified</span></> : `Mapping ${n(count, 'module')}… ${shown}/${count}`}
          </span>
          <span className="sr-only" aria-live="polite">{done ? `Mapped ${n(count, 'module')} and ${n(imports, 'import')}; ${verified} of ${imports} verified against their lines.` : ''}</span>
        </div>
        <div ref={stage} data-built={built} className="asm px-2 py-4 md:px-4">
          <Diagram l={h} o="h" {...shared} />
          <Diagram l={v} o="v" {...shared} />
        </div>
        <figcaption id="map-caption" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border px-4 py-3 text-small text-text-2 md:px-6">
          <span className="inline-flex items-center gap-2"><span className="size-3 rounded-[3px] border-[1.5px] border-accent" aria-hidden />Entry point</span>
          <span className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" aria-hidden />Most imported</span>
          <span>Each line is one import, <span className="hidden lg:inline">read left to right</span><span className="lg:hidden">read top to bottom</span>.</span>
          <ul className="sr-only">{h.wires.map(w => <li key={w.id}>{label.get(w.from)} imports {label.get(w.to)}</li>)}</ul>
        </figcaption>
      </figure>

      {receipts.length > 0 && <section aria-labelledby="receipts-title" className="mt-24 md:mt-32">
        <h2 id="receipts-title" className="font-display text-h2 text-balance">Every claim opens to its line.</h2>
        <p className="mt-4 max-w-[60ch] text-body text-text-2 text-pretty">
          Pick a citation. The code is what RepoTale read at commit {sha.slice(0, 7)}, with the cited lines marked.
          {' '}{imports === 1
            ? (verified ? 'The one import in the map cites a line that names the file it imports.' : 'The one import in the map does not cite a line that names its file.')
            : `${verified === imports ? `All ${imports}` : `${verified} of ${imports}`} imports in the map cite a line that names the file they import.`}
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
          <ul className="flex flex-col gap-2" aria-label="Claims">
            {receipts.map(r => {
              const on = r.id === active;
              return (
                <li key={r.id}>
                  <button type="button" aria-pressed={on} aria-controls="receipt" onClick={() => setActive(r.id)}
                    className={`w-full rounded-m border px-4 py-3 text-left transition-colors duration-150 ease-rt ${on ? 'border-accent bg-accent-subtle' : 'border-border hover:border-border-strong hover:bg-surface'}`}>
                    <span className="block text-body text-text">
                      <span className="font-medium">{label.get(r.from)}</span> imports {r.names.length ? r.names.join(', ') : short(r.to)} from <span className="font-medium">{short(r.to)}</span>
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-s border border-border bg-surface-2 px-2 py-0.5 font-mono text-mono-s text-text-2">
                      <span className={`size-1.5 rounded-full ${r.verified ? 'bg-verified' : 'bg-unverified'}`} aria-hidden />{r.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* Every receipt sits in the same cell, so the panel is as tall as the longest from the first paint. */}
          <div id="receipt" className="grid">
            {receipts.map(r => {
              const on = r.id === active;
              return (
                <article key={r.id} data-active={on} inert={!on} aria-label={`Receipt for ${r.label}`}
                  className={`[grid-area:1/1] flex min-w-0 flex-col rounded-l border border-border bg-surface ${on ? '' : 'invisible'}`}>
                  <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
                    <span className="font-mono text-mono-s text-text">{r.label}</span>
                    {r.verified
                      ? <span className="inline-flex items-center gap-1 font-mono text-mono-s uppercase tracking-wider text-verified-text"><Check aria-hidden size={13} strokeWidth={2.25} />Verified</span>
                      : <span className="inline-flex items-center gap-1 font-mono text-mono-s uppercase tracking-wider text-unverified-text"><TriangleAlert aria-hidden size={13} strokeWidth={2.25} />Unverified</span>}
                    <a href={r.href} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 rounded-s text-small text-text-2 transition-colors duration-150 ease-rt hover:text-text">
                      Open on GitHub<ArrowUpRight aria-hidden size={14} /><span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </header>
                  <div className="receipt flex-1 overflow-x-auto py-3" dangerouslySetInnerHTML={{ __html: r.html }} />
                  <p className="border-t border-border px-4 py-3 text-small text-text-2 text-pretty">
                    {r.verified
                      ? <>{r.end > r.line ? `Lines ${r.line} to ${r.end} name` : `Line ${r.line} names`} {short(r.to).split('/').pop()}, the file this import points to. Checked when the page was built, not assumed.</>
                      : <>The cited line{r.end > r.line ? 's do' : ' does'} not name {short(r.to).split('/').pop()}. Treat this import as unconfirmed.</>}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>}
    </>
  );
}

/** A label cut to the characters its box holds; the box's title still names the whole file. */
const fit = (s: string, chars: number) => (s.length <= chars ? s : `${s.slice(0, Math.max(1, Math.floor(chars) - 1))}…`);
const Dot = () => <span className="text-text-3" aria-hidden>·</span>;

interface DiagramProps { l: Layout; o: Orientation; nodes: FixtureNode[]; order: string[]; active: string }

/** Plain SVG. Boxes sit in reveal order, and each import sits in the group of the step its second file lands
 *  on, so `:nth-child` in CSS gives every element its beat without a per-element style. */
function Diagram({ l, o, nodes, order, active }: DiagramProps) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const box = new Map(l.boxes.map(b => [b.id, b]));
  const rank = new Map(order.map((id, i) => [id, i]));
  const [from, to] = active.split('>');
  const steps = order.map((_, i) => l.wires.filter(w => Math.max(rank.get(w.from) ?? 0, rank.get(w.to) ?? 0) === i));
  const entry = l.boxes.find(b => byId.get(b.id)?.entry);
  const hot = l.wires.find(w => w.id === active);
  const wide = o === 'h';
  const pad = wide ? 12 : 7;
  return (
    <svg viewBox={`0 0 ${l.w} ${l.h}`} aria-hidden focusable="false"
      className={wide ? 'hidden h-auto w-full lg:block' : 'mx-auto block h-auto w-full max-w-[480px] lg:hidden'}>
      <g className="asm-wires" fill="none" strokeLinecap="round">
        {steps.map((ws, i) => (
          <g key={i}>
            {ws.map(w => (
              <path key={w.id} d={w.d} pathLength={1} className={`asm-wire ${w.verified ? 'stroke-border-strong' : 'stroke-unverified'}`} />
            ))}
          </g>
        ))}
      </g>
      {/* The lit import, drawn over the others; keyed so it redraws when the reader picks another claim. */}
      {hot && <path key={hot.id} d={hot.d} pathLength={1} fill="none" strokeLinecap="round" className="asm-hot stroke-accent" />}
      <g className="asm-nodes">
        {order.map(id => {
          const b = box.get(id), n = byId.get(id);
          if (!b || !n) return null;
          return (
            <g key={id} className="asm-node" data-hot={id === from || id === to || undefined}>
              <title>{`${n.id}: ${n.lines} lines, imported by ${n.users} file${n.users === 1 ? '' : 's'}`}</title>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={wide ? 8 : 6} strokeWidth={n.entry ? 1.5 : 1}
                className={`fill-surface-2 ${n.entry ? 'stroke-accent' : 'stroke-border'}`} />
              <text x={b.x + pad} y={b.y + (wide ? 19 : 17)} className={`fill-text font-sans font-medium ${wide ? 'text-[13px]' : 'text-[11px]'}`}>{fit(n.label, (b.w - 2 * pad - (n.heart ? 8 : 0)) / (wide ? 6.8 : 5.7))}</text>
              <text x={b.x + pad} y={b.y + (wide ? 34 : 31)} className={`tabular fill-text-2 font-mono ${wide ? 'text-[11px]' : 'text-[9.5px]'}`}>{n.lines} lines</text>
              {n.heart && <circle cx={b.x + b.w - pad} cy={b.y + pad} r={wide ? 3.5 : 3} className="fill-accent" />}
            </g>
          );
        })}
      </g>
      {entry && <rect x={entry.x - 5} y={entry.y - 5} width={entry.w + 10} height={entry.h + 10} rx={wide ? 12 : 10} fill="none" strokeWidth={1.5} className="asm-pulse stroke-accent" />}
    </svg>
  );
}
