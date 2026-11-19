/** "owner/name", a github.com repository link, or a pull request link → its page on this site. */
export function target(raw: string): string | null {
  const s = raw.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const pr = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i);
  if (pr) return `/r/${pr[1]}/${pr[2]}/pull/${pr[3]}`;
  const repo = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+?)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i) ?? s.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  return repo ? `/r/${repo[1]}/${repo[2]}` : null;
}
