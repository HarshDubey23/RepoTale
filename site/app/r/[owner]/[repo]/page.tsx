import { ArrowUpRight, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyCommand } from '@/components/CopyCommand';
import { FailurePage } from '@/components/FailurePage';
import { RepoMap, StartHere } from '@/components/RepoSections';
import { LIVE, SiteFooter, SiteHeader, link } from '@/components/Site';
import { repository } from '@/lib/engine';

// Rendered per request so the loading state streams at once on a first visit; the read itself is cached
// (lib/engine.ts), so later visits render from cache and a repository is read at most once a day.
export const maxDuration = 60;

type Props = { params: Promise<{ owner: string; repo: string }> };
const num = (n: number) => n.toLocaleString('en');

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  const r = await repository(owner, repo);
  if (!r.ok) return { title: `${owner}/${repo} | RepoTale`, robots: { index: false } };
  const f = r.repo, first = f.startHere[0]?.file;
  const description = `${num(f.stats.modules)} modules and ${num(f.stats.imports)} imports in ${f.repo}, mapped from the code itself${first ? `. Start reading at ${first}` : ''}. Every claim links to its line.`;
  return { title: `${f.repo}: map, reading order and receipts | RepoTale`, description, alternates: { canonical: `/r/${f.repo}` }, openGraph: { title: `${f.repo} on RepoTale`, description }, twitter: { title: `${f.repo} on RepoTale`, description } };
}

export default async function RepoPage({ params }: Props) {
  const { owner, repo } = await params;
  const r = await repository(owner, repo);

  if (!r.ok) return <FailurePage name={`${owner}/${repo}`} failure={r.failure} path={`/r/${owner}/${repo}`} />;

  const f = r.repo, m = f.meta;
  const page = `/r/${f.repo}`;
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-24 md:px-8">
        <section aria-labelledby="repo-title" className="pt-10 md:pt-14">
          <a href={f.url} className={`font-mono text-mono-s text-text-2 ${link}`}>{f.repo}</a>
          <h1 id="repo-title" className="mt-3 break-words font-display text-display">{f.repo.split('/')[1]}</h1>
          {m?.description && <p className="mt-4 max-w-[60ch] text-[1.125rem] leading-relaxed text-text-2 text-pretty">{m.description}</p>}
          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-4 text-small">
            {m && <Fact term="Stars"><span className="inline-flex items-center gap-1.5"><Star aria-hidden size={14} className="text-text-2" />{num(m.stars)}</span></Fact>}
            <Fact term="Modules">{num(f.stats.modules)}</Fact>
            <Fact term="Imports">{num(f.stats.imports)}</Fact>
            <Fact term="Tests">{num(f.stats.tests)}</Fact>
            <Fact term="Commit"><a href={`${f.url}/tree/${f.sha}`} className={`font-mono ${link}`}>{f.sha.slice(0, 7)}</a>{m?.ref ? <span className="text-text-2"> on {m.ref}</span> : null}</Fact>
          </dl>
          {m?.partial && (
            <p className="mt-6 max-w-[64ch] rounded-m border border-border bg-surface px-4 py-3 text-small text-text-2 text-pretty">
              A large repository: RepoTale read the {num(m.read)} source files that best show its structure, out of {num(m.files)} files in all.
              Counts on this page are for those files.
            </p>
          )}
          <div className="mt-10 md:mt-14">
            <RepoMap f={f} />
          </div>
        </section>

        <StartHere f={f} />

        <section aria-labelledby="more-title" className="mt-24 grid gap-8 md:mt-32 lg:grid-cols-2">
          <div>
            <h2 id="more-title" className="font-display text-h2 text-balance">Share it, or go further.</h2>
            <p className="mt-4 max-w-[52ch] text-body text-text-2 text-pretty">
              Anyone you send this link to sees this map. It is read again at most once a day, at the latest commit, and every
              citation names the commit it came from. To see what a pull request can break, paste its link on
              the <Link href="/" className={link}>home page</Link>. To check an explanation of it, from a model or a doc,
              against these lines, <Link href={`${page}/verify`} className={link}>verify its citations</Link>. The brief and questions
              are on the current site for now.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-body">
              <Link href={`${page}/film`} className={link}>Watch the one-minute film</Link>
              <Link href={`${page}/architecture`} className={link}>See how it is built</Link>
              <Link href={`${page}/verify`} className={link}>Check what is said about it</Link>
              <a href={`${LIVE}#/${f.repo}`} className={link}>
                Open {f.repo.split('/')[1]} on the current site<ArrowUpRight aria-hidden size={16} className="ml-0.5 inline align-[-3px]" />
              </a>
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:justify-end">
            <CopyCommand command={page} share />
            <CopyCommand command={`npx -y @theharshdubey/reporeel mcp`} />
          </div>
        </section>
      </main>

      <SiteFooter>
        Read by RepoTale&rsquo;s engine from {f.repo} at commit <a href={`${f.url}/tree/${f.sha}`} className={`font-mono ${link}`}>{f.sha.slice(0, 7)}</a> on {f.builtAt},
        {' '}and read again at most once a day. Every count and citation on this page comes from that commit.
      </SiteFooter>
    </>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-text-2">{term}</dt>
      <dd className="tabular mt-1 font-mono text-mono-s text-text">{children}</dd>
    </div>
  );
}
