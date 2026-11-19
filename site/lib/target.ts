// shortcut: pull requests open on the current static site until /r/[owner]/[repo]/pull/[n] ships here.
const LIVE = 'https://harshdubey23.github.io/RepoTale/';

/** "owner/name", a github.com repository link, or a pull request link → where it opens. */
export function target(raw: string): string | null {
  const s = raw.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const pr = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i);
  if (pr) return `${LIVE}#pr=${encodeURIComponent(`https://github.com/${pr[1]}/${pr[2]}/pull/${pr[3]}`)}`;
  const repo = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+?)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i) ?? s.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  return repo ? `/r/${repo[1]}/${repo[2]}` : null;
}
