import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

export const GITHUB = 'https://github.com/HarshDubey23/RepoTale';
export const LIVE = 'https://harshdubey23.github.io/RepoTale/';

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4 md:px-8">
      <Link href="/" className="rounded-s font-display text-[1.625rem] leading-none tracking-tight">RepoTale</Link>
      <nav className="flex items-center gap-2" aria-label="Site">
        <a href={GITHUB} className="rounded-m px-3 py-2 text-small text-text-2 transition-colors duration-150 ease-rt hover:text-text">GitHub</a>
        <ThemeToggle />
      </nav>
    </header>
  );
}

export function SiteFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 text-small text-text-2 md:flex-row md:items-center md:justify-between md:px-8">
        <p className="max-w-[70ch] text-pretty">{children}</p>
        <nav className="flex gap-4" aria-label="Elsewhere">
          <a href={GITHUB} className="rounded-s hover:text-text">Source</a>
          <a href="https://www.npmjs.com/package/@theharshdubey/reporeel" className="rounded-s hover:text-text">npm</a>
        </nav>
      </div>
    </footer>
  );
}

export const link = 'rounded-s underline decoration-border-strong underline-offset-4 transition-colors duration-150 ease-rt hover:text-text hover:decoration-text-2';
