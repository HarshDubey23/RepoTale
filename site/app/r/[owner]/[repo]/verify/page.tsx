import type { Metadata } from 'next';
import Link from 'next/link';
import { FailurePage } from '@/components/FailurePage';
import { SiteFooter, SiteHeader, link } from '@/components/Site';
import { Verifier } from '@/components/Verifier';
import { repository } from '@/lib/engine';
import { sample } from '@/lib/trust';
import { verify } from '@/lib/verify';

export const maxDuration = 60;

type Props = { params: Promise<{ owner: string; repo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  const title = `Check what is said about ${owner}/${repo}`;
  const description = `Paste an explanation of ${owner}/${repo} with [file:line] citations. RepoTale reads each cited line at the commit and marks it verified, inferred, unverified or invented.`;
  return { title: `${title} | RepoTale`, description, alternates: { canonical: `/r/${owner}/${repo}/verify` }, openGraph: { title, description }, twitter: { title, description } };
}

export default async function VerifyPage({ params }: Props) {
  const { owner, repo } = await params;
  const r = await repository(owner, repo);
  if (!r.ok) return <FailurePage name={`${owner}/${repo}`} failure={r.failure} path={`/r/${owner}/${repo}/verify`} />;
  const f = r.repo, name = f.repo.split('/')[1] ?? f.repo;

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[1200px] px-4 pb-24 md:px-8">
        <section aria-labelledby="verify-title" className="max-w-[860px] pt-10 md:pt-14">
          <p className="font-mono text-mono-s text-text-2"><Link href={`/r/${f.repo}`} className={link}>{f.repo}</Link></p>
          <h1 id="verify-title" className="mt-3 font-display text-display text-balance">Does it hold up?</h1>
          <p className="mt-4 max-w-[60ch] text-[1.125rem] leading-relaxed text-text-2 text-pretty">
            Paste anything written about {name} that cites its code. RepoTale opens every cited line at commit{' '}
            <a href={`${f.url}/tree/${f.sha}`} className={`font-mono ${link}`}>{f.sha.slice(0, 7)}</a> and checks that the
            file is there, the lines are there, and they contain the code the sentence names.
          </p>
          <div className="mt-10"><Verifier action={verify.bind(null, owner, repo)} sample={sample(f)} name={name} /></div>
        </section>
      </main>
      <SiteFooter>
        Citations are read from {f.repo} at commit <a href={`${f.url}/tree/${f.sha}`} className={`font-mono ${link}`}>{f.sha.slice(0, 7)}</a>, the
        commit its map was read at. The text you paste is checked and not stored.
      </SiteFooter>
    </>
  );
}
