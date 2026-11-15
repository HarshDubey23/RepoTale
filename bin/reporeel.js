#!/usr/bin/env node
// Published builds run dist/; a checkout without a build runs the TypeScript sources directly (Node 22.18+).
import { existsSync } from 'node:fs';
const built = new URL('../dist/cli.js', import.meta.url);
await import(existsSync(built) ? built.href : new URL('../src/cli.ts', import.meta.url).href);
