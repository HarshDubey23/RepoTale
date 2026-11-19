import { repository } from '@/lib/engine';
import { card, size } from '@/lib/og';

export { size };
export const contentType = 'image/png';
export const alt = 'The repository’s import map on RepoTale, with its counts';
export const revalidate = 86400;
export async function generateStaticParams() { return []; }

export default async function Image({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  const r = await repository(owner, repo);
  if (!r.ok) return card({ kicker: `${owner}/${repo}`, title: 'Every claim,', italic: 'traced to its line.', foot: 'repotale' });
  const f = r.repo;
  return card({
    kicker: f.repo, title: f.repo.split('/')[1] ?? f.repo, description: f.meta?.description || undefined, f,
    foot: `${f.stats.modules.toLocaleString('en')} modules · ${f.stats.imports.toLocaleString('en')} imports · commit ${f.sha.slice(0, 7)}`,
  });
}
