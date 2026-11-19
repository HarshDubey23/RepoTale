import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FailurePage } from '@/components/FailurePage';
import { FilmPlayer } from '@/components/film/FilmPlayer';
import { SiteFooter, SiteHeader, link } from '@/components/Site';
import { repository } from '@/lib/engine';

export const maxDuration = 60;

type Props = { params: Promise<{ owner: string; repo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  const title = `${owner}/${repo} in one minute`;
  const description = `A narrated film of ${owner}/${repo}, made from its code: its parts, the file everything leans on, and what a change there reaches. Every sentence cites its line.`;
  return { title: `${title} | RepoTale`, description, alternates: { canonical: `/r/${owner}/${repo}/film` }, openGraph: { title, description }, twitter: { title, description } };
}

export default async function FilmPage({ params }: Props) {
  const { owner, repo } = await params;
  const r = await repository(owner, repo);
  if (!r.ok) return <FailurePage name={`${owner}/${repo}`} failure={r.failure} path={`/r/${owner}/${repo}/film`} />;
  const f = r.repo, name = f.repo.split('/')[1] ?? f.repo;
  if (!f.film) notFound();
  const words = f.film.scenes.flatMap(s => s.beats).reduce((n, b) => n + b.say.split(/\s+/).length, 0);

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1100px] px-4 pb-24 md:px-8">
        <section aria-labelledby="film-title" className="pt-10 md:pt-14">
          <nav aria-label="Breadcrumb" className="font-mono text-mono-s text-text-2">
            <ol className="flex flex-wrap items-center gap-x-2">
              <li><Link href={`/r/${f.repo}`} className={link}>{f.repo}</Link></li>
              <li aria-hidden>/</li>
              <li aria-current="page">film</li>
            </ol>
          </nav>
          <h1 id="film-title" className="mt-3 max-w-[24ch] font-display text-h2 text-balance">{name}, in about a minute.</h1>
          <p className="mt-4 max-w-[62ch] text-body text-text-2 text-pretty">
            Written from the code at commit {f.sha.slice(0, 7)}: {words} words, each sentence shown as it is said and cited below.
            The voice is made in your browser; nothing you hear is sent anywhere. Space plays, the arrow keys step a sentence, C turns on captions.
          </p>
          <div className="mt-8"><FilmPlayer film={f.film} name={name} blob={`${f.url}/blob/${f.sha}/`} /></div>
          <p className="mt-10 text-body text-text-2">
            Want the parts in more depth? <Link href={`/r/${f.repo}/architecture`} className={link}>Open the architecture of {name}</Link>.
          </p>
        </section>
      </main>
      <SiteFooter>
        Every sentence comes from {f.repo} at commit <a href={`${f.url}/tree/${f.sha}`} className={`font-mono ${link}`}>{f.sha.slice(0, 7)}</a>, read by
        RepoTale&rsquo;s engine. Narration by Kokoro-82M, an open model, run on your device.
      </SiteFooter>
    </>
  );
}
