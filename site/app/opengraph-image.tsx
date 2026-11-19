import { demo } from '@/lib/fixture';
import { card, size } from '@/lib/og';

export { size };
export const contentType = 'image/png';
export const alt = 'RepoTale: every claim about a codebase, traced to its line. The import map of sindresorhus/ky.';

export default function Image() {
  return card({
    kicker: `${demo.repo} @ ${demo.sha.slice(0, 7)}`, title: 'Every claim about a codebase,', italic: 'traced to its line.', f: demo,
    foot: `${demo.stats.modules} modules · ${demo.stats.imports} imports · read by its engine`,
  });
}
