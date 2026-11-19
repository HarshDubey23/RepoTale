import { join } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The engine lives one level up (web/analyze.js, shared with the static site and the CLI), so the
  // build and the server bundle trace files from the repository root.
  outputFileTracingRoot: join(__dirname, '..'),
  // Share cards read their fonts from disk at request time; make sure the files ship with those functions.
  outputFileTracingIncludes: Object.fromEntries(
    ['/opengraph-image', '/r/[owner]/[repo]/opengraph-image', '/r/[owner]/[repo]/pull/[number]/opengraph-image', '/r/[owner]/[repo]/verify/opengraph-image']
      .map(route => [route, ['./assets/og/*.woff']]),
  ),
};
export default config;
