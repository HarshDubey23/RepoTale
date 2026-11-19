import { RepoForm } from '@/components/RepoForm';
import { SiteHeader } from '@/components/Site';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-32 pt-10 md:px-8 md:pt-14">
        <p className="font-mono text-mono-s text-text-2">404</p>
        <h1 className="mt-4 max-w-[20ch] font-display text-h2 text-balance">No page at this address.</h1>
        <p className="mt-4 max-w-[56ch] text-body text-text-2 text-pretty">
          Repository pages live at /r/owner/name, and pull requests at /r/owner/name/pull/number. Paste either one:
        </p>
        <div className="mt-8"><RepoForm /></div>
      </main>
    </>
  );
}
