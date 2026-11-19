import { repository } from '@/lib/engine';
import { card, size } from '@/lib/og';

export { size };
export const contentType = 'image/png';
export const alt = 'Check what is said about this repository: every citation read at its commit';
export const revalidate = 86400;
export async function generateStaticParams() { return []; }

export default async function Image({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  const r = await repository(owner, repo);
  const name = r.ok ? r.repo.repo : `${owner}/${repo}`;
  return card({
    kicker: name, title: 'Does it hold up?', italic: 'Every citation, checked.',
    description: `Paste what a model or a doc says about ${name.split('/')[1] ?? name}. Every [file:line] is read at the commit.`,
    foot: r.ok ? `citations read at commit ${r.repo.sha.slice(0, 7)}` : 'repotale',
  });
}
