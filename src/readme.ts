// `reporeel readme`: puts the video, the diagram and a scene-by-scene summary into the README
// between markers, so re-running replaces its own block and never touches anything else.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const START = '<!-- reporeel:start -->', END = '<!-- reporeel:end -->';

export function upsertBlock(md: string, block: string): string {
  const wrapped = `${START}\n${block.trim()}\n${END}`;
  const a = md.indexOf(START), b = md.indexOf(END);
  if (a >= 0 && b > a) return md.slice(0, a) + wrapped + md.slice(b + END.length);
  // First time: after the title and the first paragraph, which is where visitors look.
  const lines = md.split('\n');
  let i = lines.findIndex(l => /^#\s/.test(l));
  if (i < 0) return wrapped + '\n\n' + md;
  i++;
  while (i < lines.length && !lines[i].trim()) i++;
  while (i < lines.length && lines[i].trim() && !/^#/.test(lines[i])) i++;
  let j = i;
  while (j < lines.length && !lines[j].trim()) j++;
  return [...lines.slice(0, i), '', wrapped, '', ...lines.slice(j)].join('\n');
}

export function readmeBlock(root: string, media: string): string {
  const rel = (f: string) => relative(root, join(media, f)).split('\\').join('/');
  const has = (f: string) => existsSync(join(media, f));
  const parts: string[] = [];
  if (has('reporeel.gif')) parts.push(`<a href="${rel('reporeel.mp4')}"><img src="${rel('reporeel.gif')}" width="800" alt="Narrated walkthrough of this project"></a>\n\n<sub>Silent preview. ▶ <a href="${rel('reporeel.mp4')}">Watch the narrated video</a>${has('reporeel.srt') ? ` · <a href="${rel('reporeel.srt')}">captions</a>` : ''}</sub>`);
  if (has('README-section.md')) {
    const chapters = readFileSync(join(media, 'README-section.md'), 'utf8').split('### What the video covers')[1];
    if (chapters) parts.push(`<details><summary><b>What the video covers</b></summary>\n\n${chapters.trim()}\n\n</details>`);
  }
  if (has('architecture.svg')) parts.push(`<details><summary><b>Architecture</b></summary>\n\n<img src="${rel('architecture.svg')}" alt="Architecture diagram" width="800">\n\n</details>`);
  return parts.join('\n\n');
}

export function writeReadme(root: string, media: string): string {
  const file = ['README.md', 'readme.md', 'Readme.md'].map(f => join(root, f)).find(existsSync) ?? join(root, 'README.md');
  const md = existsSync(file) ? readFileSync(file, 'utf8') : `# ${root.split('/').pop()}\n`;
  writeFileSync(file, upsertBlock(md, readmeBlock(root, media)));
  return file;
}
