# RepoTale site

The Next.js app that will replace the static site in `../web`. It runs the same engine (`../web/analyze.js`,
`../web/insight.js`) on the server, so a repository or pull request gets a page with its own link and share card.

| Route | What it shows |
| --- | --- |
| `/` | The landing page, with sindresorhus/ky as a committed demo (`fixtures/ky.json`) |
| `/r/owner/repo` | Any public repository: its import map, three cited claims, and where to start reading |
| `/r/owner/repo/pull/123` | A pull request: risk level, how far the change travels through imports, what to review first |
| `/r/owner/repo/film` | A narrated film for a newcomer: what the project is (its README), how to install and use it, its parts, the way in, where to start reading. Voice made in the browser (Kokoro); every sentence cites its line |
| `/r/owner/repo/architecture` | What each part does, in its authors' words or from what the code defines, how the parts connect, and the way in; `?part=` opens one part |
| `/r/owner/repo/verify` | Paste text that cites the code as `[file:line]`: each citation checked at the commit and marked verified, inferred, unverified or invented |
| `.../opengraph-image` | A share card per page, drawn from the same map |

## Run it

```bash
npm install
npm run build
npm start -- -p 3210
```

`npm run check` runs the self-checks (citation ranges, layering, line routing, form targets).
`npm run fixture -- sindresorhus/ky <commit>` rebuilds the landing demo from a fresh clone.

## Deploy on Vercel

1. Import the repository and set **Root Directory** to `site`.
2. Keep **Include files outside the root directory** on (the default). The build reads `../web`.
3. Add the environment variable **`GITHUB_TOKEN`**: a fine-grained token with read-only access to public
   repositories. Without it, GitHub allows 60 API requests an hour for the whole site; with it, 5,000. One
   repository read uses 3, and one pull request 4 to 6. File contents come from raw.githubusercontent.com
   (`publicFiles` in `analyze`), which does not count. When the limit runs out, pages say "GitHub asked
   RepoTale to wait" and nothing is cached, so the next visit tries again.
4. Optional: set **`SITE_URL`** (for example `https://repotale.dev`) if you use a custom domain, so share cards
   carry it. Without it, the production `*.vercel.app` domain is used.

Reads are cached: a repository for a day, a pull request for an hour. The cache key includes a version
(`repotale-repo-v4`, `repotale-pull-v1`); bump it when the page shape changes.

## Measured locally

Production build, measured with Lighthouse 12.8 on this machine:

- Initial JavaScript on `/`: 181 KB gzip. No inline `style` attributes on the page.
- CLS 0 on all pages.
- Lighthouse desktop `/`: 100 performance, 100 accessibility, 100 best practices, 100 SEO.
- Lighthouse mobile: 93 performance on `/` and 92 on `/r/pallets/flask` in an earlier run. Accessibility, best
  practices and SEO are 100 on both. On 19 November the same build of `/` scored between 65 and 88 across six
  runs on this machine, with total blocking time between 320 and 1,790 ms, so these numbers are not stable here.
  The simulated mobile LCP stayed at 2.9 to 3.2 s, above the 2 s budget; the observed LCP in those traces was
  about 0.9 s. Measure again on the deployed site.
