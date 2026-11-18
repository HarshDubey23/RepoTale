# Import accuracy against hand-labelled repositories

Produced by `node bench/accuracy.ts` on 2026-11-18. Ground truth: [truth.json](truth.json), which says how it was labelled. Four small repositories is a small sample: these numbers describe these files, not every codebase.

## expressjs/express @ 43fca52

7 files labelled.

**web/analyze.js (website, MCP server)**

- Imports between files: precision 100.0%, recall 100.0% (7 right, 0 wrong, 0 missed)
- Outside packages: precision 100.0%, recall 100.0% (32 right, 0 wrong, 0 missed)

**src/graph.ts (CLI: graph, check, pr)**

- Imports between files: precision 100.0%, recall 100.0% (7 right, 0 wrong, 0 missed)
- Outside packages: precision 100.0%, recall 100.0% (32 right, 0 wrong, 0 missed)


## chalk/chalk @ 7211001

5 files labelled.

**web/analyze.js (website, MCP server)**

- Imports between files: precision 100.0%, recall 33.3% (1 right, 0 wrong, 2 missed)
- Outside packages: precision n/a, recall n/a (0 right, 0 wrong, 0 missed)
  - missed import: `source/index.js -> source/vendor/ansi-styles/index.js`
  - missed import: `source/index.js -> source/vendor/supports-color/index.js`
  - files not read at all: `source/vendor/ansi-styles/index.js`, `source/vendor/supports-color/index.js`, `source/vendor/supports-color/browser.js`

**src/graph.ts (CLI: graph, check, pr)**

- Imports between files: precision 100.0%, recall 33.3% (1 right, 0 wrong, 2 missed)
- Outside packages: precision n/a, recall n/a (0 right, 0 wrong, 0 missed)
  - missed import: `source/index.js -> source/vendor/ansi-styles/index.js`
  - missed import: `source/index.js -> source/vendor/supports-color/index.js`
  - files not read at all: `source/vendor/ansi-styles/index.js`, `source/vendor/supports-color/index.js`, `source/vendor/supports-color/browser.js`


## pmndrs/zustand @ 9fed2eb

15 files labelled.

**web/analyze.js (website, MCP server)**

- Imports between files: precision 100.0%, recall 100.0% (21 right, 0 wrong, 0 missed)
- Outside packages: precision 100.0%, recall 100.0% (6 right, 0 wrong, 0 missed)

**src/graph.ts (CLI: graph, check, pr)**

- Imports between files: precision 100.0%, recall 100.0% (21 right, 0 wrong, 0 missed)
- Outside packages: precision 100.0%, recall 100.0% (6 right, 0 wrong, 0 missed)


## psf/requests @ 3c7baaa

19 files labelled.

**web/analyze.js (website, MCP server)**

- Imports between files: precision 100.0%, recall 100.0% (73 right, 0 wrong, 0 missed)

**src/graph.ts (CLI: graph, check, pr)**

- Imports between files: precision 100.0%, recall 100.0% (73 right, 0 wrong, 0 missed)

## All four together

| Analyzer | Imports between files | Outside packages (3 repos) |
|---|---|---|
| web/analyze.js (website, MCP server) | precision 100.0%, recall 98.1% (102 right, 0 wrong, 2 missed) | precision 100.0%, recall 100.0% (38 right, 0 wrong, 0 missed) |
| src/graph.ts (CLI: graph, check, pr) | precision 100.0%, recall 98.1% (102 right, 0 wrong, 2 missed) | precision 100.0%, recall 100.0% (38 right, 0 wrong, 0 missed) |
