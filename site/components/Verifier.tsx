'use client';
import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { LEVELS, MAX_TEXT, type Level } from '@/lib/trust';
import type { Item, Report } from '@/lib/verify';

const TRUST: Record<Level, { word: string; tone: string; fill: string; chip: string; means: string }> = {
  verified: { word: 'Verified', tone: 'text-verified-text', fill: 'fill-verified bg-verified', chip: 'border-verified/50 bg-verified/10 text-verified-text', means: 'the cited lines hold everything the sentence names' },
  inferred: { word: 'Inferred', tone: 'text-inferred-text', fill: 'fill-inferred bg-inferred', chip: 'border-inferred/50 bg-inferred/10 text-inferred-text', means: 'they hold some of it, and the rest is the writer’s reading' },
  unverified: { word: 'Unverified', tone: 'text-unverified-text', fill: 'fill-unverified bg-unverified', chip: 'border-unverified/50 bg-unverified/10 text-unverified-text', means: 'the lines exist, but nothing in them confirms the sentence' },
  invented: { word: 'Invented', tone: 'text-invented-text', fill: 'fill-invented bg-invented', chip: 'border-invented/50 bg-invented/10 text-invented-text line-through decoration-1', means: 'the file or the lines are not there at this commit' },
};

type Props = { action: (prev: Report | null, form: FormData) => Promise<Report>; sample: string; name: string };

export function Verifier({ action, sample, name }: Props) {
  const id = useId();
  const [report, run, pending] = useActionState(action, null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [seen, setSeen] = useState<Report | null>(null);
  const shown = error || (report && !report.ok && report !== seen ? report.message : '');

  const submit = (e: FormEvent<HTMLFormElement>) => {
    if (text.trim()) return setError('');
    e.preventDefault();
    setError('Paste the explanation you want checked first.');
  };

  return (
    <>
      <form action={run} onSubmit={submit} noValidate>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <label htmlFor={id} className="text-small text-text">What was said about {name}</label>
          <button type="button" onClick={() => { setText(sample); setError(''); }}
            className="rounded-s text-small text-text-2 underline decoration-border-strong underline-offset-4 transition-colors duration-150 ease-rt hover:text-text">
            Use a sample with two mistakes
          </button>
        </div>
        <textarea id={id} name="text" value={text} maxLength={MAX_TEXT} rows={7} spellCheck={false}
          onChange={e => { setText(e.target.value); setSeen(report); if (error) setError(''); }}
          aria-invalid={shown ? true : undefined} aria-describedby={`${id}-hint ${id}-error`}
          placeholder="The client is created in [source/index.ts:12] and retries live in [source/core/Ky.ts:40-60]."
          className={`mt-2 block w-full resize-y rounded-l border bg-surface p-4 font-mono text-mono-s leading-relaxed text-text shadow-rt outline-none transition-colors duration-150 ease-rt placeholder:text-text-2 focus:border-accent ${shown ? 'border-invented' : 'border-border-strong'}`} />
        <p id={`${id}-hint`} className="mt-2 text-small text-text-2 text-pretty">
          An answer from a model, a design doc, a pull request description: anything with citations written as [path:line] or [path:start-end].
        </p>
        <p id={`${id}-error`} role="alert" className={`mt-1 min-h-[1.45em] text-small ${shown ? 'text-invented-text' : ''}`}>{shown}</p>
        <button type="submit" disabled={pending}
          className="mt-2 inline-flex items-center gap-2 rounded-m bg-accent px-4 py-2.5 text-small font-semibold text-on-accent transition-colors duration-150 ease-rt hover:bg-accent-hover disabled:cursor-progress">
          {pending ? <><LoaderCircle aria-hidden size={16} className="animate-spin" />Reading the cited lines</> : 'Check every citation'}
        </button>
      </form>
      {report?.ok && <Findings key={report.text + report.sha} r={report} />}
    </>
  );
}

function Findings({ r }: { r: Extract<Report, { ok: true }> }) {
  const title = useRef<HTMLHeadingElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    title.current?.focus({ preventScroll: false });
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const total = r.items.length;
  const trusted = r.counts.verified;

  return (
    <section aria-labelledby="report-title" className="mt-16 md:mt-20">
      <h2 id="report-title" ref={title} tabIndex={-1} className="rounded-s font-display text-h2 text-balance outline-none">
        {trusted === total ? `All ${total} citations hold.` : `${trusted} of ${total} ${total === 1 ? 'citation holds' : 'citations hold'}.`}
      </h2>
      <p className="mt-3 text-small text-text-2">Checked against commit <span className="font-mono">{r.sha.slice(0, 7)}</span>. A citation that holds points at the code being discussed; it does not prove the sentence is right.</p>

      {/* The Reveal Count: each level counts up while its share of the bar grows in. */}
      <div className="mt-8 rounded-l border border-border bg-surface p-5 shadow-rt md:p-6">
        <svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <g className="tally" data-on={on || undefined}>
            {LEVELS.reduce<{ x: number; els: React.ReactNode[] }>((a, l) => {
              const w = total ? (r.counts[l] / total) * 100 : 0;
              if (w) a.els.push(<rect key={l} x={a.x} y={0} width={w} height={4} className={TRUST[l].fill} />);
              return { x: a.x + w, els: a.els };
            }, { x: 0, els: [] }).els}
          </g>
        </svg>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          {LEVELS.map(l => (
            <div key={l}>
              <dt className={`flex items-center gap-2 font-mono text-mono-s uppercase tracking-wider ${TRUST[l].tone}`}>
                <span className={`size-2 rounded-full ${TRUST[l].fill}`} aria-hidden />{TRUST[l].word}
              </dt>
              <dd className="tabular mt-1 font-display text-h2 leading-none"><Count n={r.counts[l]} on={on} /></dd>
              <dd className="mt-2 text-small text-text-2 text-pretty">{TRUST[l].means}</dd>
            </div>
          ))}
        </dl>
      </div>

      <h3 className="mt-14 font-display text-h3">The text, with its receipts</h3>
      <p className="mt-4 max-w-[72ch] whitespace-pre-wrap text-body leading-[1.8] text-text text-pretty">
        {r.segments.map((s, i) => 'text' in s ? <Ticks key={i} text={s.text} /> : <Chip key={i} n={s.cite} item={r.items[s.cite]} />)}
      </p>

      <h3 className="mt-14 font-display text-h3">Every citation</h3>
      <ol className="mt-6 grid gap-px overflow-hidden rounded-l border border-border bg-border">
        {r.items.map((it, i) => <Citation key={i} n={i} it={it} />)}
      </ol>
    </section>
  );
}

function Count({ n, on }: { n: number; on: boolean }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) return;
    const dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700;
    const t0 = performance.now(); let f = 0;
    const tick = (t: number) => { const p = dur ? Math.min(1, (t - t0) / dur) : 1; setV(Math.round(n * (1 - (1 - p) ** 3))); if (p < 1) f = requestAnimationFrame(tick); };
    f = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(f);
  }, [n, on]);
  return <><span aria-hidden>{v}</span><span className="sr-only">{n}</span></>;
}

function Chip({ n, item }: { n: number; item?: Item }) {
  if (!item) return null;
  return (
    <a href={`#cite-${n}`} className={`mx-0.5 inline rounded-s border px-1.5 py-0.5 font-mono text-mono-s transition-colors duration-150 ease-rt hover:bg-surface-2 ${TRUST[item.level].chip}`}>
      {item.label}<span className="sr-only">, {TRUST[item.level].word.toLowerCase()}</span>
    </a>
  );
}

/** Text with `code` in backticks set as code, the way it was written. */
function Ticks({ text }: { text: string }) {
  return <>{text.split(/(`[^`\n]+`)/).map((p, i) => i % 2 ? <code key={i} className="font-mono text-[0.9em] text-text">{p.slice(1, -1)}</code> : p)}</>;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A cited line with the names the sentence used marked where they appear. */
function Line({ text, names }: { text: string; names: string[] }) {
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`(${names.map(n => escape(n.split('.').pop() ?? n)).join('|')})`, 'g');
  return <>{text.split(re).map((p, i) => i % 2 ? <mark key={i} className="rounded-s bg-verified/15 text-text">{p}</mark> : p)}</>;
}

function Citation({ n, it }: { n: number; it: Item }) {
  const t = TRUST[it.level];
  const span = it.start !== null && it.end !== null ? it.end - it.start + 1 : 0;
  return (
    <li id={`cite-${n}`} className="scroll-mt-24 bg-bg px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 font-mono text-mono-s uppercase tracking-wider ${t.tone}`}><span className={`size-1.5 rounded-full ${t.fill}`} aria-hidden />{t.word}</span>
        <a href={it.href} className="break-all rounded-s font-mono text-mono-s text-text underline decoration-border-strong underline-offset-4 transition-colors duration-150 ease-rt hover:decoration-text-2">
          {it.label}<ArrowUpRight aria-hidden size={14} className="ml-0.5 inline align-[-2px]" />
        </a>
      </div>
      <p className="mt-1.5 text-body text-text-2 text-pretty"><Ticks text={it.why} /></p>
      {it.lines.length > 0 && (
        <pre className="mt-3 overflow-x-auto rounded-m border border-border bg-surface py-2 font-mono text-mono-s leading-relaxed">
          {it.lines.map(l => (
            <span key={l.n} className="flex px-3"><span className="w-10 shrink-0 select-none pr-3 text-right text-text-2" aria-hidden>{l.n}</span><span className="text-text"><Line text={l.text} names={it.found} /></span>{'\n'}</span>
          ))}
        </pre>
      )}
      {span > it.lines.length && it.lines.length > 0 && <p className="mt-2 text-small text-text-2">The first {it.lines.length} of {span} cited lines.</p>}
    </li>
  );
}
