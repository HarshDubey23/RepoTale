'use client';
import { RotateCw } from 'lucide-react';
import { SiteHeader } from '@/components/Site';

// A read that failed for a reason that may pass (GitHub's rate limit, a timeout). Nothing is cached, so retrying reads again.
export default function RepoError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const limited = /rate limit/i.test(error.message);
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-32 pt-10 md:px-8 md:pt-14">
        <h1 className="max-w-[20ch] font-display text-h2 text-balance">
          {limited ? 'GitHub asked RepoTale to slow down.' : 'This read did not finish.'}
        </h1>
        <p className="mt-4 max-w-[56ch] text-body text-text-2 text-pretty" role="alert">
          {limited
            ? 'It allows a limited number of reads an hour. Try again in a few minutes; nothing on your side needs to change.'
            : 'Something between RepoTale and GitHub failed partway. Trying again usually works.'}
        </p>
        <button type="button" onClick={retry}
          className="mt-8 inline-flex items-center gap-2 rounded-m bg-accent px-4 py-2.5 text-small font-semibold text-on-accent transition-colors duration-150 ease-rt hover:bg-accent-hover">
          <RotateCw aria-hidden size={16} />Try again
        </button>
      </main>
    </>
  );
}
