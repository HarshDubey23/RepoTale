# Benchmark: static analysis on 20 real repositories

Produced by `node bench/run.ts` on 2026-11-15, Node v22.15.0, win32. Shallow clones at the commits listed; nothing from them was run.

| repo | commit | modules | tests | symbols | edges | unresolved | resolved | isolated | ms | plan | broken | coverage |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| expressjs/express | 43fca52 | 142 | 92 | 461 | 154 | 0 | 100.0% | 4 | 479 | valid | 0 | 100% |
| sindresorhus/got | 6b5aafc | 96 | 63 | 687 | 308 | 6 | 98.1% | 7 | 327 | valid | 0 | 100% |
| axios/axios | 85ffbaf | 283 | 186 | 851 | 393 | 1 | 99.7% | 79 | 501 | valid | 0 | 100% |
| fastify/fastify | 7e0c8fe | 282 | 228 | 1233 | 480 | 31 | 93.9% | 8 | 594 | valid | 0 | 100% |
| honojs/hono | f6fbaf0 | 425 | 163 | 1500 | 984 | 12 | 98.8% | 22 | 920 | valid | 0 | 100% |
| vitejs/vite | f898888 | 1658 | 439 | 3512 | 1875 | 49 | 97.5% | 773 | 2956 | valid | 0 | 100% |
| preactjs/preact | 9cc5761 | 230 | 136 | 749 | 252 | 8 | 96.9% | 37 | 424 | valid | 0 | 100% |
| pmndrs/zustand | 9fed2eb | 49 | 16 | 201 | 34 | 0 | 100.0% | 19 | 200 | valid | 0 | 100% |
| chalk/chalk | 7211001 | 13 | 8 | 28 | 11 | 0 | 100.0% | 1 | 110 | valid | 0 | 100% |
| tj/commander.js | a5a7dc0 | 170 | 123 | 151 | 140 | 1 | 99.3% | 53 | 249 | valid | 0 | 100% |
| colinhacks/zod | fef16cb | 520 | 206 | 4040 | 642 | 0 | 100.0% | 245 | 779 | valid | 0 | 100% |
| prettier/prettier | 2cc4f0f | 5966 | 5298 | 11381 | 2147 | 130 | 94.3% | 4947 | 7005 | valid | 0 | 100% |
| pallets/flask | 49943b5 | 83 | 48 | 586 | 198 | 0 | 100.0% | 10 | 306 | valid | 0 | 100% |
| psf/requests | 3c7baaa | 37 | 15 | 218 | 115 | 0 | 100.0% | 3 | 189 | valid | 0 | n/a |
| fastapi/fastapi | 2a1bd23 | 1227 | 670 | 5610 | 1830 | 3 | 99.8% | 212 | 1373 | valid | 0 | 100% |
| pallets/click | e38188e | 91 | 59 | 992 | 173 | 0 | 100.0% | 6 | 258 | valid | 0 | n/a |
| encode/httpx | b5addb6 | 60 | 37 | 751 | 122 | 0 | 100.0% | 3 | 152 | valid | 0 | 100% |
| pytest-dev/pytest | 50234b4 | 274 | 125 | 2626 | 918 | 3 | 99.7% | 67 | 538 | valid | 0 | n/a |
| Textualize/rich | 3a109cc | 212 | 67 | 1052 | 758 | 0 | 100.0% | 4 | 336 | valid | 0 | n/a |
| django/django | f24f38c | 2988 | 2045 | 9487 | 10129 | 3 | 100.0% | 724 | 3818 | valid | 0 | 100% |

**Totals over the 20 that were analysed:** 14806 modules, 46116 symbols, 21663 import edges, 247 relative imports that point at no file (98.9% resolved), 21.5s in total.

## How to read it

- **modules / tests / symbols**: TypeScript, JavaScript and Python files found, how many of them are test files by name, and top-level declarations.
- **edges**: imports that resolve to a file in the repository. **unresolved**: relative imports that do not. **resolved** is edges / (edges + unresolved).
- **isolated**: modules with no edge in or out. Some really are standalone (scripts, fixtures); others are reached in ways this analysis does not follow (path aliases, package names inside a monorepo, dynamic imports, entry points named in config).
- **plan / broken / coverage**: whether the offline draft storyboard is valid, how many of its scenes cite something that does not exist, and the share of its claim-making scenes that are observed or grounded. The draft only ever cites the manifests it read, so a high number here shows the draft does not invent citations, not that it is a good video. `n/a` means the draft made no claim to check.

## What this does not measure

- **Correctness of the graph.** There is no hand-labelled ground truth here. An edge is real by construction (its target file exists), but missing edges are not counted, and a low `unresolved` number does not mean nothing was missed.
- **Calls.** Only imports are followed.
- **Videos.** Rendering, narration and the Claude planner need a browser, ffmpeg and an API key; none of that ran here.
- **Safety under attack.** That is covered by `test/security.test.ts`, not by this run.
