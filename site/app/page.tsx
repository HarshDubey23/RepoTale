import { ArrowUpRight } from 'lucide-react';
import { CopyCommand } from '@/components/CopyCommand';
import { RepoForm } from '@/components/RepoForm';
import { RepoMap, StartHere } from '@/components/RepoSections';
import { LIVE, SiteFooter, SiteHeader, link } from '@/components/Site';
import { demo as f } from '@/lib/fixture';
import { LEVELS, TRUST } from '@/lib/trust';
import Link from 'next/link';

// Repositories in different languages and shapes, each read end to end while this page was built.
const TRY = ['pallets/flask', 'expressjs/express', 'tj/commander.js'];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-24 md:px-8">
        <section aria-labelledby="hero-title" className="pt-10 md:pt-14">
          <h1 id="hero-title" className="hang max-w-[22ch] font-display text-display text-balance">
            Every claim about a codebase, <em className="text-accent-text">traced to its line.</em>
          </h1>
          <p className="mt-6 max-w-[58ch] text-[1.125rem] leading-relaxed text-text-2 text-pretty">
            Paste a repository or a pull request. RepoTale maps its real imports, shows where to start reading and what a change can break,
            and links every statement to the file and line behind it.
          </p>
          <div className="mt-8 flex flex-col gap-1">
            <RepoForm />
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-small text-text-2">
              <span>Or open one:</span>
              {TRY.map(r => <Link key={r} href={`/r/${r}`} prefetch={false} className={`font-mono text-mono-s ${link}`}>{r}</Link>)}
            </p>
            <a href={`${LIVE}#demo`} className={`mt-2 w-fit text-small text-text-2 ${link}`}>
              Or watch the one-minute film it made of a real repository<ArrowUpRight aria-hidden size={14} className="ml-0.5 inline align-[-2px]" />
            </a>
          </div>
          <div className="mt-10 md:mt-14">
            <RepoMap f={f} />
          </div>
        </section>

        <StartHere f={f} />

        <section aria-labelledby="verify-title" className="mt-24 md:mt-32">
          <h2 id="verify-title" className="max-w-[24ch] font-display text-h2 text-balance">Check what a model told you about a codebase.</h2>
          <p className="mt-4 max-w-[60ch] text-body text-text-2 text-pretty">
            Paste an answer, a doc or a pull request description that cites code as [file:line]. RepoTale opens every cited line at the
            commit and says which citations hold, and why the others do not.
          </p>
          <dl className="mt-8 grid gap-px overflow-hidden rounded-l border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {LEVELS.map(l => (
              <div key={l} className="bg-bg px-4 py-4 md:px-5">
                <dt className={`flex items-center gap-2 font-mono text-mono-s uppercase tracking-wider ${TRUST[l].tone}`}>
                  <span className={`size-2 rounded-full ${TRUST[l].fill}`} aria-hidden />{TRUST[l].word}
                </dt>
                <dd className="mt-2 text-small text-text-2 text-pretty">{TRUST[l].means}</dd>
              </div>
            ))}
          </dl>
          <Link href={`/r/${f.repo}/verify`} prefetch={false} className={`mt-6 inline-block text-body ${link}`}>Try it on {f.repo.split('/')[1]}, with a sample that has two mistakes</Link>
        </section>

        <section aria-labelledby="agent-title" className="mt-24 grid gap-8 md:mt-32 lg:grid-cols-2 lg:items-end">
          <div>
            <h2 id="agent-title" className="font-display text-h2 text-balance">Give your coding agent the same map.</h2>
            <p className="mt-4 max-w-[52ch] text-body text-text-2 text-pretty">
              One command starts an MCP server in your repository. Your agent asks what a change breaks, who imports a file, or where to begin,
              and gets answers from the import graph instead of a guess.
            </p>
          </div>
          <CopyCommand command="npx -y @theharshdubey/reporeel mcp" />
        </section>
      </main>

      <SiteFooter>
        The demo is {f.repo} at commit <a href={`${f.url}/tree/${f.sha}`} className={`font-mono ${link}`}>{f.sha.slice(0, 7)}</a>,
        {' '}read by RepoTale&rsquo;s own engine on {f.builtAt}. Nothing on this page is typed in by hand.
      </SiteFooter>
    </>
  );
}
