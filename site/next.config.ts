import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: __dirname }, // the repository root has its own lockfile; this app builds on its own
};
export default config;
