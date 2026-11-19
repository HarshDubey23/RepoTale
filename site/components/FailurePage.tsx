import { RotateCw } from 'lucide-react';
import Link from 'next/link';
import { RepoForm } from '@/components/RepoForm';
import { SiteHeader } from '@/components/Site';
import type { Failure } from '@/lib/engine';

const TITLE: Record<Failure['kind'], string> = {
  missing: 'Nothing to read here.',
  empty: 'Nothing here for RepoTale to map.',
  limited: 'GitHub asked RepoTale to wait.',
};

/** The designed states for a page that could not be built: missing, empty, and GitHub's hourly limit. */
export function FailurePage({ name, failure, path }: { name: string; failure: Failure; path: string }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-32 pt-10 md:px-8 md:pt-14">
        <p className="font-mono text-mono-s text-text-2">{name}</p>
        <h1 className="mt-4 max-w-[20ch] font-display text-h2 text-balance">{TITLE[failure.kind]}</h1>
        <p className="mt-4 max-w-[56ch] text-body text-text-2 text-pretty">{failure.message}</p>
        {failure.kind === 'limited' ? (
          <Link href={path} className="mt-8 inline-flex items-center gap-2 rounded-m bg-accent px-4 py-2.5 text-small font-semibold text-on-accent transition-colors duration-150 ease-rt hover:bg-accent-hover">
            <RotateCw aria-hidden size={16} />Try again
          </Link>
        ) : (
          <div className="mt-8"><p className="mb-3 text-small text-text-2">Try another one:</p><RepoForm /></div>
        )}
      </main>
    </>
  );
}
