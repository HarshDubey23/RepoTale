import { card, size } from '@/lib/og';
import { pullRequest } from '@/lib/pull';

export { size };
export const contentType = 'image/png';
export const alt = 'The pull request’s risk on RepoTale: how far the change travels through imports';
export const revalidate = 3600;
export async function generateStaticParams() { return []; }

const WORD = { high: 'High risk', medium: 'Medium risk', low: 'Low risk' } as const;

export default async function Image({ params }: { params: Promise<{ owner: string; repo: string; number: string }> }) {
  const { owner, repo, number } = await params;
  const r = await pullRequest(owner, repo, number);
  if (!r.ok) return card({ kicker: `${owner}/${repo}#${number}`, title: 'Every claim,', italic: 'traced to its line.', foot: 'repotale' });
  const p = r.pull;
  const reached = p.bands.slice(1).reduce((s, b) => s + b.source.length, 0);
  return card({
    kicker: `${p.repo}#${p.number}`, title: p.title,
    description: `Changes ${p.changed} file${p.changed === 1 ? '' : 's'}; through imports it reaches ${reached} other source file${reached === 1 ? '' : 's'} and ${p.tests.length} test${p.tests.length === 1 ? '' : 's'}.`,
    foot: `+${p.additions.toLocaleString('en')} −${p.deletions.toLocaleString('en')} · commit ${p.sha.slice(0, 7)}`,
    badge: { text: WORD[p.level], tone: p.level },
  });
}
