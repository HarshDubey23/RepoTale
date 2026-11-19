import { ArrowUpRight } from 'lucide-react';
import { Suspense } from 'react';
import { CopyCommand } from '@/components/CopyCommand';
import { Demo } from '@/components/Demo';
import { RepoForm } from '@/components/RepoForm';
import { ThemeToggle } from '@/components/ThemeToggle';
import { demo as f, permalink } from '@/lib/fixture';
import { layout } from '@/lib/layout';
import { receipts } from '@/lib/receipts';

const LIVE = 'https://harshdubey23.github.io/RepoTale/';
const GITHUB = 'https://github.com/HarshDubey23/RepoTale';

export default async function Home() {
  // The claims: where the entry starts (its first two imports) and the widest citation into the heart.
  const fromEntry = f.edges.filter(e => e.from === f.entry).sort((a, b) => a.line - b.line).slice(0, 2);
  const intoHeart = f.edges.filter(e => e.to === f.heart && !fromEntry.includes(e)).sort((a, b) => b.end - b.line - (a.end - a.line)).slice(0, 1);
  const { list, css } = await receipts(f, [...fromEntry, ...intoHeart]);
  const minutes = f.startHere.reduce((s, x) => s + x.minutes, 0);

  return (
    <>
      <style>{css}</style>
      <header className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4 md:px-8">
        <a href="#main" className="rounded-s font-display text-[1.625rem] leading-none tracking-tight">RepoTale</a>
        <nav className="flex items-center gap-2" aria-label="Site">
          <a href={GITHUB} className="rounded-m px-3 py-2 text-small text-text-2 transition-colors duration-150 ease-rt hover:text-text">GitHub</a>
          <ThemeToggle />
        </nav>
      </header>

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
            <a href={`${LIVE}#demo`} className="w-fit rounded-s text-small text-text-2 underline decoration-border-strong underline-offset-4 transition-colors duration-150 ease-rt hover:text-text hover:decoration-text-2">
              Or watch the one-minute film it made of a real repository<ArrowUpRight aria-hidden size={14} className="ml-0.5 inline align-[-2px]" />
            </a>
          </div>
          <div className="mt-10 md:mt-14">
            {/* Its own boundary, so React hydrates the demo in a separate task from the rest of the page. */}
            <Suspense><Demo repo={f.repo} sha={f.sha} nodes={f.nodes} h={layout(f.nodes, f.edges, 'h')} v={layout(f.nodes, f.edges, 'v')} receipts={list} /></Suspense>
          </div>
        </section>

        <section aria-labelledby="start-title" className="mt-24 md:mt-32">
          <h2 id="start-title" className="font-display text-h2 text-balance">Where to start reading.</h2>
          <p className="mt-4 max-w-[60ch] text-body text-text-2 text-pretty">
            {f.startHere.length} files, about {minutes} minutes, in the order that makes the rest of {f.repo.split('/')[1]} make sense.
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

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-small text-text-2 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="max-w-[70ch] text-pretty">
            The demo is {f.repo} at commit <a href={`${f.url}/tree/${f.sha}`} className="rounded-s font-mono underline decoration-border-strong underline-offset-4 hover:text-text">{f.sha.slice(0, 7)}</a>,
            {' '}read by RepoTale&rsquo;s own engine on {f.builtAt}. Nothing on this page is typed in by hand.
          </p>
          <nav className="flex gap-4" aria-label="Elsewhere">
            <a href={GITHUB} className="rounded-s hover:text-text">Source</a>
            <a href="https://www.npmjs.com/package/@theharshdubey/reporeel" className="rounded-s hover:text-text">npm</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
