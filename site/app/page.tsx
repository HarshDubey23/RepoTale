import { ArrowUpRight } from 'lucide-react';
import { CopyCommand } from '@/components/CopyCommand';
import { RepoForm } from '@/components/RepoForm';
import { RepoMap, StartHere } from '@/components/RepoSections';
import { LIVE, SiteFooter, SiteHeader, link } from '@/components/Site';
import { demo as f } from '@/lib/fixture';

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
            <a href={`${LIVE}#demo`} className={`w-fit text-small text-text-2 ${link}`}>
              Or watch the one-minute film it made of a real repository<ArrowUpRight aria-hidden size={14} className="ml-0.5 inline align-[-2px]" />
            </a>
          </div>
          <div className="mt-10 md:mt-14">
            <RepoMap f={f} />
          </div>
        </section>

        <StartHere f={f} />

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
