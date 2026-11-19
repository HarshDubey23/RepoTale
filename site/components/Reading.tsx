'use client';
// Loading and slow: the repository's name at once, the honest reason for the wait, and a different line
// when the wait runs long. The bars hold the real page's layout, so nothing jumps when it arrives.
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const SLOW = 12_000, VERY = 40_000;

export function Reading() {
  const name = decodeURIComponent(usePathname().replace(/^\/r\//, ''));
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setWaited(SLOW), SLOW), b = setTimeout(() => setWaited(VERY), VERY);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  return (
    <div aria-busy="true">
      <p className="font-mono text-mono-s text-text-2">{name}</p>
      <h1 className="mt-3 font-display text-display text-text-2">Reading{'…'}</h1>
      <p className="mt-4 max-w-[60ch] text-[1.125rem] leading-relaxed text-text-2 text-pretty" role="status">
        {waited >= VERY
          ? 'Still working. GitHub is answering slowly; this page will appear as soon as the read finishes.'
          : waited >= SLOW
            ? 'A large repository takes longer the first time. After this visit, the page opens at once for everyone.'
            : 'RepoTale is fetching its file list and source files from GitHub, then mapping every import.'}
      </p>
      <div className="mt-8 flex gap-8" aria-hidden>
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-10 w-20 rounded-s" />)}
      </div>
      <div className="mt-10 rounded-l border border-border bg-surface md:mt-14" aria-hidden>
        <div className="border-b border-border px-4 py-3 md:px-6"><div className="skeleton h-4 w-48 rounded-s" /></div>
        <div className="skeleton m-4 aspect-[340/360] rounded-m lg:aspect-[1100/236]" />
      </div>
    </div>
  );
}
