import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArchDiagram } from '@/components/ArchDiagram';
import { CopyCommand } from '@/components/CopyCommand';
import { FailurePage } from '@/components/FailurePage';
import { SiteFooter, SiteHeader, link } from '@/components/Site';
import type { ArchNode, ArchView } from '@/lib/arch';
import { repository } from '@/lib/engine';
import type { Cite } from '@/lib/film';

export const maxDuration = 60;

type Props = { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ part?: string }> };
const plural = (n: number, w: string) => `${n.toLocaleString('en')} ${w}${n === 1 ? '' : 's'}`;
const base = (f: string) => f.split('/').pop() ?? f;

/** A receipt: the file and lines a statement was read from, opened at the commit. */
function Receipt({ c, at }: { c: Cite; at: string }) {
  const lines = c.line ? `${c.line}${c.end && c.end > c.line ? `-${c.end}` : ''}` : '';
  return (
    <a href={`${at}${c.file}${c.line ? `#L${c.line}${c.end && c.end > c.line ? `-L${c.end}` : ''}` : ''}`}
      className="mt-2 inline-flex max-w-full items-center gap-1.5 break-all rounded-s border border-border bg-surface-2 px-2 py-0.5 font-mono text-mono-s text-text-2 transition-colors duration-150 ease-rt hover:text-text">
      <span className="size-1.5 shrink-0 rounded-full bg-verified" aria-hidden />{c.file}{lines ? `:${lines}` : ''}
    </a>
  );
}

/** What a part or file does: its authors' words with their line when they wrote some, then what its code holds
 *  and which parts it works with. Nothing is guessed: with no comment, the page says so. */
function Describe({ n, at }: { n: ArchNode; at: string }) {
  return (
    <>
      {n.about && <><p className="mt-2 text-body text-text text-pretty">&ldquo;{n.about.text}&rdquo;</p><Receipt at={at} c={{ file: n.about.file, line: n.about.line }} /></>}
      {n.holds && <p className={`mt-2 text-body text-pretty ${n.about ? 'text-text-2' : 'text-text'}`}>{n.holds}</p>}
      {n.links && <p className="mt-1 text-small text-text-2 text-pretty">{n.links}</p>}
      {!n.about && <p className="mt-2 text-small text-text-2">No comment in its code says what it is for; this is what the code itself shows.</p>}
    </>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  const title = `How ${owner}/${repo} is built`;
  const description = `What ${owner}/${repo} is, what each of its parts does and how they fit together, in its authors' own words, with every statement traced to its line.`;
  return { title: `${title} | RepoTale`, description, alternates: { canonical: `/r/${owner}/${repo}/architecture` }, openGraph: { title, description }, twitter: { title, description } };
}

export default async function ArchitecturePage({ params, searchParams }: Props) {
  const [{ owner, repo }, { part }] = await Promise.all([params, searchParams]);
  const r = await repository(owner, repo);
  if (!r.ok) return <FailurePage name={`${owner}/${repo}`} failure={r.failure} path={`/r/${owner}/${repo}/architecture`} />;
  const f = r.repo, arch = f.arch, name = f.repo.split('/')[1] ?? f.repo, page = `/r/${f.repo}/architecture`;
  if (!arch) notFound();
  // A flat package has no overview: its one part is the whole picture.
  const v: ArchView | undefined = part ? arch.parts.find(p => p.area === part) : arch.overview ?? arch.parts[0];
  if (!v) notFound();
  const href = (area: string) => `${page}?part=${encodeURIComponent(area)}`;
  const title = (id: string) => v.nodes.find(n => n.id === id)?.title ?? id;
  const at = `${f.url}/blob/${f.sha}/`, blob = (file: string, line?: number) => `${at}${file}${line ? `#L${line}` : ''}`;
  const opened = v.level === 'focus' && !!arch.overview;
  const drawnFiles = v.nodes.filter(n => n.role === 'file');

  // The plain-language story is the film's: what it is (the README's words) and the way in, step by step.
  const scenes = f.film?.scenes ?? [];
  const what = scenes.find(s => s.kind === 'title')?.beats[1];
  const flow = scenes.find(s => s.kind === 'flow');
  const parts = v.nodes.filter(n => n.role === 'part');
  const partNode = opened ? arch.overview?.nodes.find(n => n.area === v.area) : undefined;

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-24 md:px-8">
        <section aria-labelledby="arch-title" className="pt-10 md:pt-14">
          <nav aria-label="Breadcrumb" className="font-mono text-mono-s text-text-2">
            <ol className="flex flex-wrap items-center gap-x-2">
              <li><Link href={`/r/${f.repo}`} className={link}>{f.repo}</Link></li>
              <li aria-hidden>/</li>
              <li>{opened ? <Link href={page} className={link}>architecture</Link> : <span aria-current="page">architecture</span>}</li>
              {opened && <><li aria-hidden>/</li><li aria-current="page">{v.title}</li></>}
            </ol>
          </nav>
          <h1 id="arch-title" className="mt-3 max-w-[24ch] font-display text-h2 text-balance">{opened ? `Inside ${v.title}.` : `How ${name} is built.`}</h1>
          {!opened && what && (
            <div className="mt-6 max-w-[64ch]">
              <p className="font-display text-[1.5rem] leading-snug text-text text-pretty md:text-[1.75rem]">{what.say}</p>
              {what.cite && <Receipt at={at} c={what.cite} />}
            </div>
          )}
          {opened && partNode && <div className="mt-6 max-w-[64ch]"><Describe n={partNode} at={at} /></div>}
        </section>

        {!opened && flow && flow.kind === 'flow' && (
          <section aria-labelledby="flow-title" className="mt-14 md:mt-20">
            <h2 id="flow-title" className="font-display text-h2 text-balance">What happens when you use it.</h2>
            <p className="mt-4 max-w-[60ch] text-body text-text-2 text-pretty">Start at the front door and follow the imports: each step is a file, in its authors&rsquo; words where they wrote some.</p>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {flow.steps.map((st, i) => {
                const beat = flow.beats[i];
                return (
                  <li key={st.id} className="rounded-l border border-border bg-surface p-5">
                    <p className="font-mono text-mono-s text-text-2">{i === 0 ? 'Where you come in' : `Step ${i}`}</p>
                    <p className="mt-2 font-display text-h3 text-text">{base(st.file)}</p>
                    <p className="font-mono text-mono-s text-text-2 break-all">{st.file}</p>
                    <p className="mt-3 text-body text-text-2 text-pretty">{st.text || (i === 0 ? 'The file a program loads first.' : `Imported by ${base(flow.steps[i - 1]!.file)}.`)}</p>
                    {beat?.cite && <Receipt at={at} c={beat.cite} />}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section aria-labelledby="map-title" className="mt-14 md:mt-20">
          <h2 id="map-title" className="font-display text-h2 text-balance">{opened ? 'Its files, and who they talk to.' : v.level === 'overview' ? 'Its parts, and how they connect.' : 'Its files, and how they connect.'}</h2>
          <p className="mt-4 max-w-[62ch] text-body text-text-2 text-pretty">
            {opened
              ? <>{plural(v.files, 'file')} in <span className="font-mono text-mono-s">{v.area}</span>{v.hidden ? `; the ${plural(drawnFiles.length, 'busiest')} are drawn` : ''}. The parts it talks to are folded into one box each; open one to go there.</>
              : v.level === 'overview'
                ? <>Each box is a folder of code; an arrow means one part uses another (it imports from it), thicker when it does so more. Open a part to see its files.</>
                : <>One package: its busiest files, and an arrow where one uses another.</>}
          </p>
          <div className="mt-8"><ArchDiagram v={v} href={href} label={`${v.title} of ${name}`} /></div>
        </section>

        {(parts.length > 0 || drawnFiles.length > 0) && (
          <section aria-labelledby="each-title" className="mt-14 md:mt-20">
            <h2 id="each-title" className="font-display text-h2 text-balance">{parts.length ? 'What each part does.' : 'What each file does.'}</h2>
            <p className="mt-4 max-w-[60ch] text-body text-text-2 text-pretty">Quoted from its authors where they wrote a comment saying what it is for, with the line it is on. Below that, what the code itself shows: what it defines, and which parts it works with.</p>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {(parts.length ? parts : drawnFiles).map(n => (
                <li key={n.id} className="rounded-l border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-display text-h3 text-text">{n.role === 'file' ? base(n.file ?? n.id) : n.title}</p>
                    {n.role === 'part' && n.area
                      ? <Link href={href(n.area)} className={`text-small ${link}`}>Open {n.title}</Link>
                      : <span className="font-mono text-mono-s text-text-2">{n.sub}</span>}
                  </div>
                  {n.role === 'file' && <p className="font-mono text-mono-s text-text-2 break-all">{n.file}</p>}
                  <Describe n={n} at={at} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="arrows-title" className="mt-14 md:mt-20">
          <h2 id="arrows-title" className="font-display text-h2 text-balance">The proof behind every arrow.</h2>
          <details className="mt-6 rounded-l border border-border">
            <summary className="cursor-pointer rounded-l px-4 py-3 text-body text-text">Show {plural(v.edges.length, 'arrow')}, each with the import that makes it</summary>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[640px] text-left text-small">
                <thead className="bg-surface text-text-2">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-normal">From</th><th scope="col" className="px-4 py-3 font-normal">To</th>
                    <th scope="col" className="px-4 py-3 font-normal">What crosses</th><th scope="col" className="px-4 py-3 font-normal">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {v.edges.map(e => (
                    <tr key={`${e.from}>${e.to}`}>
                      <td className="px-4 py-3 text-text">{title(e.from)}</td>
                      <td className="px-4 py-3 text-text">{title(e.to)}{e.both && <span className="ml-2 font-mono text-mono-s text-text-2">both ways</span>}</td>
                      <td className="px-4 py-3 text-text-2">
                        {e.external ? e.label : `${plural(e.count, 'import')}${e.label && !/imports?$/.test(e.label) ? `: ${e.label}` : ''}`}
                        {!e.drawn && <span className="ml-2 font-mono text-mono-s text-unverified-text">closes a loop, not drawn</span>}
                      </td>
                      <td className="px-4 py-3">
                        {e.cite
                          ? <a href={blob(e.cite.file, e.cite.line)} className={`break-all font-mono text-mono-s ${link}`}>{e.cite.file}{e.cite.line ? `:${e.cite.line}` : ''}</a>
                          : <span className="text-text-2">who starts it</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        {opened && arch.parts.length > 1 && (
          <nav aria-labelledby="parts-title" className="mt-14 md:mt-20">
            <h2 id="parts-title" className="font-display text-h2 text-balance">Other parts.</h2>
            <ul className="mt-6 flex flex-wrap gap-2">
              {arch.parts.filter(p => p.area !== v.area).map(p => (
                <li key={p.area}><Link href={href(p.area ?? '')} className="inline-block rounded-m border border-border px-3 py-2 text-small text-text transition-colors duration-150 ease-rt hover:bg-surface">{p.title}</Link></li>
              ))}
            </ul>
          </nav>
        )}

        <section aria-labelledby="export-title" className="mt-14 grid gap-8 md:mt-20 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 id="export-title" className="font-display text-h2 text-balance">Take it with you.</h2>
            <p className="mt-4 max-w-[52ch] text-body text-text-2 text-pretty">The same diagram as Mermaid, for a README or a design doc. GitHub draws it in place.</p>
            <Link href={`/r/${f.repo}/film`} className={`mt-6 inline-block text-body ${link}`}>
              Watch the one-minute film of {name}<ArrowUpRight aria-hidden size={16} className="ml-0.5 inline align-[-3px]" />
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            <CopyCommand command={opened ? href(v.area ?? '') : page} share />
            <details className="rounded-m border border-border bg-surface">
              <summary className="cursor-pointer rounded-m px-4 py-3 text-small text-text">Mermaid source</summary>
              <pre className="max-h-[320px] overflow-auto border-t border-border px-4 py-3 font-mono text-mono-s text-text-2">{v.mermaid}</pre>
            </details>
          </div>
        </section>
      </main>
      <SiteFooter>
        Read by RepoTale&rsquo;s engine from {f.repo} at commit <a href={`${f.url}/tree/${f.sha}`} className={`font-mono ${link}`}>{f.sha.slice(0, 7)}</a>.
        Descriptions are quoted from its README and code comments; parts are folders, arrows are imports. Nothing here is guessed.
      </SiteFooter>
    </>
  );
}
