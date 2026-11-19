import { Reading } from '@/components/Reading';
import { SiteHeader } from '@/components/Site';

// The first visit to a repository reads it from GitHub; this holds the page's shape meanwhile.
export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 md:px-8 md:pt-14">
        <Reading />
      </main>
    </>
  );
}
