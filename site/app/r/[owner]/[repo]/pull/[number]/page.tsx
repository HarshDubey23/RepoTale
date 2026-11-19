import { ArrowUpRight, GitPullRequest } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyCommand } from '@/components/CopyCommand';
import { FailurePage } from '@/components/FailurePage';
import { RiskWave } from '@/components/RiskWave';
import { SiteFooter, SiteHeader, link } from '@/components/Site';
import { pullRequest, type PullView } from '@/lib/pull';

// Rendered per request so the loading state streams at once; the read is cached per pull request for an hour.
export const maxDuration = 60;

type Props = { params: Promise<{ owner: string; repo: string; number: string }> };
const LEVEL = {
  high: { word: 'High risk', tone: 'text-invented-text', dot: 'bg-invented' },
  medium: { word: 'Medium risk', tone: 'text-unverified-text', dot: 'bg-unverified' },
  low: { word: 'Low risk', tone: 'text-verified-text', dot: 'bg-verified' },
} as const;
const plural = (n: number, w: string) => `${n.toLocaleString('en')} ${w}${n === 1 ? '' : 's'}`;

function summary(p: PullView) {
  const reached = p.bands.slice(1).reduce((s, b) => s + b.source.length, 0);
  const tests = p.tests.length;
  // "5 files" next to a band of "2 source files" reads as a contradiction unless the rest are named.
  const parts = [plural(p.bands[0]?.source.length ?? 0, 'source file'), p.bands[0]?.tests.length ? plural(p.bands[0].tests.length, 'test') : '',
    p.notRead.length ? `${p.notRead.length} other` : ''].filter(Boolean);
  return `Changes ${plural(p.changed, 'file')}${parts.length > 1 ? ` (${parts.join(', ')})` : ''}. Through imports, the change reaches `
    + `${plural(reached, 'other source file')} of the ${p.sourceFiles} read${tests ? `, and ${plural(tests, 'test')} reach it` : ', and no test among the files read reaches it'}.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo, number } = await params;
  const r = await pullRequest(owner, repo, number);
  if (!r.ok) return { title: `${owner}/${repo}#${number} | RepoTale`, robots: { index: false } };
  const p = r.pull;
  const title = `#${p.number} ${p.title} (${p.repo})`, description = `${LEVEL[p.level].word}. ${summary(p)}`;
  return { title: `${title} | RepoTale`, description, alternates: { canonical: `/r/${p.repo}/pull/${p.number}` }, openGraph: { title, description }, twitter: { title, description } };
}

export default async function PullPage({ params }: Props) {
  const { owner, repo, number } = await params;
  const r = await pullRequest(owner, repo, number);
  if (!r.ok) return <FailurePage name={`${owner}/${repo}#${number}`} failure={r.failure} path={`/r/${owner}/${repo}/pull/${number}`} />;

  const p = r.pull, level = LEVEL[p.level];
  const blob = `https://github.com/${p.headRepo}/blob/${p.sha}/`;
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-24 md:px-8">
        <section aria-labelledby="pull-title" className="pt-10 md:pt-14">
          <p className="flex flex-wrap items-center gap-x-2 font-mono text-mono-s text-text-2">
            <GitPullRequest aria-hidden size={14} />
            <Link href={`/r/${p.repo}`} className={link}>{p.repo}</Link>
            <span aria-hidden>·</span>
            <a href={p.url} className={link}>#{p.number}</a>
          </p>
          <h1 id="pull-title" className="mt-3 max-w-[28ch] font-display text-h2 text-balance">{p.title}</h1>
          <p className="mt-4 text-small text-text-2">
            {p.author ? <>by <span className="text-text">{p.author}</span>, </> : null}{p.state}, into <span className="font-mono">{p.base}</span> at
            {' '}<a href={`https://github.com/${p.headRepo}/tree/${p.sha}`} className={`font-mono ${link}`}>{p.sha.slice(0, 7)}</a>
            {' '}· <span className="tabular font-mono text-verified-text">+{p.additions.toLocaleString('en')}</span> <span className="tabular font-mono text-invented-text">&minus;{p.deletions.toLocaleString('en')}</span>
          </p>

          <div className="mt-10 rounded-l border border-border bg-surface p-5 shadow-rt md:p-8">
            <p className={`flex items-center gap-2 font-mono text-mono-s uppercase tracking-wider ${level.tone}`}>
              <span className={`size-2 rounded-full ${level.dot}`} aria-hidden />{level.word}
            </p>
            <p className="mt-3 max-w-[60ch] text-[1.25rem] leading-snug text-text text-pretty">{summary(p)}</p>
            <p className="mt-4 text-small text-text-2">
              Inferred from the import graph at this commit, not from running the code. Each reason below cites a line that imports the file.
            </p>
          </div>
        </section>

        <section aria-labelledby="wave-title" className="mt-16 md:mt-24">
          <h2 id="wave-title" className="font-display text-h2 text-balance">How far it travels.</h2>
          <p className="mt-4 max-w-[60ch] text-body text-text-2 text-pretty">
            Each band holds the files one more import away from the change. Bars show the share of the {p.sourceFiles} source files read.
          </p>
          <div className="mt-8"><RiskWave bands={p.bands} sourceFiles={p.sourceFiles} blob={blob} /></div>
        </section>

        <section aria-labelledby="risks-title" className="mt-16 md:mt-24">
          <h2 id="risks-title" className="font-display text-h2 text-balance">{p.risks.length ? 'Look here first.' : 'Nothing stands out.'}</h2>
          {p.risks.length ? (
            <ol className="mt-8 grid gap-px overflow-hidden rounded-l border border-border bg-border">
              {p.risks.map((k, i) => (
                <li key={k.file} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 bg-bg px-4 py-5 md:grid-cols-[3rem_minmax(0,1fr)] md:px-6">
                  <span className="tabular font-display text-h3 text-text-2" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <a href={`${blob}${k.file}`} className={`break-all font-mono text-mono-s text-text ${link}`}>{k.file}</a>
                    <p className="mt-1.5 text-body text-text-2 text-pretty">{k.why.charAt(0).toUpperCase() + k.why.slice(1)}.</p>
                    {k.cite && (
                      <a href={`${blob}${k.cite.file}#L${k.cite.line}`} className="mt-2 inline-flex items-center gap-1.5 rounded-s border border-border bg-surface-2 px-2 py-0.5 font-mono text-mono-s text-text-2 transition-colors duration-150 ease-rt hover:text-text">
                        <span className="size-1.5 rounded-full bg-verified" aria-hidden />{k.cite.file}:{k.cite.line} imports it
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 max-w-[60ch] text-body text-text-2 text-pretty">No changed file is a core module, reaches a third of the code, or lacks a test while others depend on it.</p>
          )}
        </section>

        <section aria-labelledby="files-title" className="mt-16 md:mt-24">
          <h2 id="files-title" className="font-display text-h2 text-balance">Every changed file.</h2>
          <div className="mt-8 overflow-x-auto rounded-l border border-border">
            <table className="w-full min-w-[640px] text-left text-small">
              <thead className="bg-surface text-text-2">
                <tr><th scope="col" className="px-4 py-3 font-normal">File</th><th scope="col" className="px-4 py-3 font-normal">Change</th><th scope="col" className="px-4 py-3 text-right font-normal">Reached by</th><th scope="col" className="px-4 py-3 text-right font-normal">Tests</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.files.map(f => (
                  <tr key={f.file}>
                    <td className="max-w-[420px] px-4 py-3"><a href={`${blob}${f.file}`} className={`break-all font-mono text-mono-s ${link}`}>{f.file}</a>{f.core && <span className="ml-2 font-mono text-mono-s uppercase text-accent-text">core</span>}</td>
                    <td className="tabular whitespace-nowrap px-4 py-3 font-mono text-mono-s text-text-2">{f.status} <span className="text-verified-text">+{f.additions}</span> <span className="text-invented-text">&minus;{f.deletions}</span></td>
                    <td className="tabular px-4 py-3 text-right font-mono text-mono-s">{f.sourceReach}</td>
                    <td className={`tabular px-4 py-3 text-right font-mono text-mono-s ${f.tests ? '' : 'text-unverified-text'}`}>{f.tests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(p.notRead.length > 0 || p.sampled) && (
            <p className="mt-4 max-w-[70ch] text-small text-text-2 text-pretty">
              {p.notRead.length > 0 && <>{plural(p.notRead.length, 'changed file')} {p.notRead.length === 1 ? 'is' : 'are'} not code RepoTale maps (docs, config, assets) and {p.notRead.length === 1 ? 'is' : 'are'} not counted. </>}
              {p.sampled && <>The repository is large: reach is counted among the files read, so the real reach can be wider.</>}
            </p>
          )}
        </section>

        <section aria-labelledby="ci-title" className="mt-16 grid gap-8 md:mt-24 lg:grid-cols-2 lg:items-end">
          <div>
            <h2 id="ci-title" className="font-display text-h2 text-balance">Get this on every pull request.</h2>
            <p className="mt-4 max-w-[52ch] text-body text-text-2 text-pretty">
              <code className="font-mono text-mono-s">reporeel ci</code> writes a GitHub Action that posts this verdict as a comment on each pull request and updates it on every push, read from your own checkout.
            </p>
            <a href={p.url} className={`mt-6 inline-block text-body ${link}`}>Open #{p.number} on GitHub<ArrowUpRight aria-hidden size={16} className="ml-0.5 inline align-[-3px]" /></a>
          </div>
          <div className="flex flex-col gap-3">
            <CopyCommand command={`/r/${p.repo}/pull/${p.number}`} share />
            <CopyCommand command="npx -y @theharshdubey/reporeel ci" />
          </div>
        </section>
      </main>
      <SiteFooter>
        Read by RepoTale&rsquo;s engine from {p.headRepo} at commit <a href={`https://github.com/${p.headRepo}/tree/${p.sha}`} className={`font-mono ${link}`}>{p.sha.slice(0, 7)}</a>,
        {' '}the head of #{p.number}, and read again at most once an hour.
      </SiteFooter>
    </>
  );
}
