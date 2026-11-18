# Changelog

## Unreleased

- `reporeel review`: what the current branch can break, as Markdown (changed files, how far each reaches through imports, the tests on those paths, what to look at first). The workflow `reporeel ci` writes puts it on every pull request's run summary; it reads only, so it also runs for forks.
- Review reasons count source files and tests apart ("a core module: 21 source files and 10 tests reach it"), so they match the table; it used to say 31 files for the same 21.
- **Breaking, privacy:** `plan` no longer sends the repository to Anthropic as soon as `ANTHROPIC_API_KEY` is set. It shows what would be sent and sends only on a `y` or `--send`; otherwise it writes the offline draft. Sensitive files (`.env*`, keys, certificates, credentials, registry logins) are never sent, and recognised secrets are replaced with `[REDACTED]`. Library callers pass `confirm` to `planWithClaude`.
- **Security:** the workflow `reporeel ci` writes runs README commands inside the Docker sandbox (clean clone, no runner environment or credentials, resource limits, network on for installs) instead of on the runner.
- **Security:** `--sandbox` checks for a running Docker first and stops if there is none, instead of failing per command.
- **Security:** a terminal scene's `cwd` must stay inside the repository (absolute paths, `..` and symlink or junction escapes are refused), and `app.start` may not `cd` out of it.
- **Security:** command output and storyboard text placed in a scene's script are escaped, so `</script>` in a test's output cannot inject markup into the recording page.
- Terminal scenes keep each command's exit code, timeout, stdout and stderr, and the video ends each command with a verdict from its exit code. A failing test that prints "passed" no longer looks like a pass.
- Diagrams from manifests draw an arrow solid only when imports between the two parts exist (with the count); guesses from the order of parts are dashed and labelled `inferred`. A web app that imports its API used to be drawn as web → cli → api.
- `bench/accuracy.ts` and `bench/ACCURACY.md`: both import analyzers scored against hand-labelled imports of Express, chalk, zustand and requests. It found and this release fixes: `from . import a, b` read as one import (website), a spurious edge to `__init__.py` for every `from . import submodule` (CLI), and `#` package imports turned into a package with an empty name (both). Measured after: precision 100%, recall 98.1% between files; 100%/100% for outside packages.
- Review no longer calls a wide change "Low reach". A changed file that reaches a third or more of the source files through imports is listed first and the verdict is at least "Worth a close look": Flask #6133 changed `sansio/scaffold.py`, which reaches 21 of the 24 source files, and was rated low with "the change stays local". The summary also stopped saying "1 source file in 3 parts": it counts the parts the change is in, not the parts it reaches.
- A pull request's header shows `PR head@abc1234` instead of the head commit's full hash twice.
- Start here picks the real front door. It used to start FastAPI at a docs example (`docs_src/.../main.py`), hono at its Bun adapter and Flask at `views.py`; it now starts at `fastapi/__init__.py`, `src/index.ts` and `app.py`. A library's `__init__`/`index` counts even when its own modules import it back, files named after the package count (`fastify.js`), docs, examples, scripts and benchmarks never do, a door that leads to another comes first, and Python's `__main__.py` shim does not. Type, typing and compat files are no longer offered as "the heart". Checked on 20 public repositories (Express, Flask, FastAPI, Django, Vite, hono, pytest and others).
- Docs example folders (`docs_src`, `samples`, `demos`, `playground`) are no longer read. On FastAPI they filled the 220-file budget and became nine of the ten subsystems on the map; the map now shows Fastapi, Security, Openapi, Middleware and the rest.
- "Pulling in N of its files" counted a file once per imported name (Click's `__init__.py` claimed 69). Each file now counts once, here and in the Files view.
- `check` no longer calls a render out of date because a file was checked out with Windows line endings.
- Workflows set `ONNXRUNTIME_NODE_INSTALL_CUDA=skip`: on Linux the voice engine's installer fetched a CUDA build that now answers 404, which failed `npm ci` in CI, in releases and in the workflow `reporeel ci` writes.
- The voice is back on the graphics card: on a laptop processor Kokoro was six to nine times slower than speech, so the film played with music only. Its warm-up starts when Read is pressed, each scene waits for its own voice (with a small "Warming up the voice" label rather than a freeze screen), and the score restarts in step with the narration.

- The voice model warms up while the code is being read, so the first scene is voiced sooner, and on a processor at most two copies run, so the laptop stays responsive.
- Lighter pages: the homepage diagram's pulses and the looping clip run only while on screen, scrolling writes once per frame, and the film draws without canvas shadows or blurs.
- Subsystems are named by their own folder ("Market", "Gateway"), with the parent folder only when two names would clash.
- The overview keeps every subsystem's strongest link, and lines up any with no imports either way in a row below, so a large repository reads as one compact map.
- In the film, an opened subsystem's name has its own band above the diagram instead of sitting on its top row.

- The landing demo is re-recorded in all three voices with the overview, a subsystem opened, and the score; the README GIF and the two stills under it show the new architecture.
- Film: a new diagram builds in its first four seconds instead of across the whole scene, and long import names are no longer read aloud.

- The homepage shows RepoTale's own architecture overview, whole and readable, instead of a crop of the full diagram; each box opens its folder on GitHub. On a phone the frame fits the diagram.
- An import of the compiled build (`../dist/cli.js`) now resolves to the source it was built from (`src/cli.ts`) when the build is not in the repository.
- The overview leaves out a one-file folder with no imports either way; it stays in "Every component".

- A Brief opens every repository: one line on what it is and what everything leans on, the architecture overview as a picture, the film, the first three files to read with minutes, and a question box that answers straight away. Each card leads to its full view.

- Architecture has levels. The overview shows each subsystem as one card and every import between two subsystems as one arrow, with the exact count (two heads when they import each other). Select a subsystem to open it: its own files inside, the subsystems that use it and that it uses as single boxes around it. "Every component" keeps the full diagram. Exports follow the level on screen.
- Film: the architecture is told as a drill-down. The overview builds itself, then the two busiest subsystems open one after the other, each narrated from its real imports.

- Film: an original score composed in code with a whoosh at each scene change (Music toggle), letter-by-letter titles, a code editor that types itself with syntax colours, and a vertical 9:16 export with large word-by-word captions.
- Ask is free by default: answers from the code itself, Chrome's built-in AI where available, Claude optional.

## 0.3.0 (2026-11-16)

- Pull request review on the website: paste a PR link to see what it can break (dependents through imports, tests on those paths, untested changes, a verdict), with changed files outlined on the diagram. Changed files and their tests are always read.
- Start here: the reading path into a repository, with reasons and reading time.
- Ask: answers from Claude Opus 5.5 with the visitor's key, every [file:line] citation checked against the code and flagged when it does not hold. Server-side refusal fallback is enabled.
- `repotale mcp`: an MCP server over stdio for coding agents, with impact, who_imports, explain_file, import_path, start_here and repo_overview answered from the working tree's import graph.
- `web/insight.js`: the shared logic behind all four, used by the website and the CLI.

- Website: paste any website link to get a narrated film of its pages, read and photographed through r.jina.ai (paced under the free limit; optional Jina key). Public repositories still open when GitHub rate-limits, through ungh.cc.

- The film reads each live page through r.jina.ai and narrates what it actually says: its headline, the sections it walks through, or its first sentence. The browser's built-in voice is no longer offered, and a saved choice of it falls back to the neural voice.

- Website redesign, Apple-minimal: white, near-black ink, one blue, bold tightly tracked Inter Tight; the same look on the page, in the film and in the diagram (light by default, dark on request). Diagram parts are drawn by kind: cylinders for databases, a cloud for hosted services, a pipe for queues, a browser window for UI, cut corners for APIs, a folded page for config, side rails for tools. Page scenes have a camera that finds the two busiest regions of each page, pushes in on them with a cursor that clicks, and scrolls to the end; each scene enters with a transition chosen from what it is and what came before (zoom, iris, slide, wipe, blur, rise).

- Renamed to RepoTale. The CLI keeps the `reporeel` command and npm package, and is also installed as `repotale`.
- The website (`web/`, published to GitHub Pages by `.github/workflows/pages.yml`): paste a GitHub link and get a narrated film, an architecture map with blast radius, an evidence report and exports (share link, README badge, SVG, Mermaid, `graph.json`, a `reporeel.json` storyboard). It reads code in the browser and runs nothing. Imports resolve for JavaScript, TypeScript (with path aliases), Python and Go; every link is pinned to the analysed commit; import cycles are reported in import order.
- Website film: a neural voice (Kokoro-82M, in the browser, four English voices) with scene lengths fitted to the audio, and downloaded videos that carry the voice; the live site's pages, photographed and scrolled through, each tied to the file that defines its route; wipe transitions between scenes.
- Website architecture view: components in subsystems, outside services and the user, laid out by ELK with orthogonal arrows labelled by what each import brings in; "used by N" badges instead of fan-in tangles; pan, zoom, pinch, hover tracing, click to code; SVG, PNG (dark or light) and Mermaid.
- Film: the architecture on one continuous canvas, built up and then visited subsystem by subsystem by the camera; captions that follow the voice word by word; a moving glow and dot-grid ground; soft entrances between scenes.
- Voice: studio-quality Kokoro on WebGPU when there is a graphics card, and ElevenLabs with your own key.
- Imports now record the names they bring in.
- Fixed: a `"**/*.ts"` in `tsconfig.json` was read as the end of a comment, which dropped every path alias and most imports in projects that use `@/`.
- Security: the workflow written by `reporeel ci` no longer runs README commands for pull requests from forks (a pull request can change the README), and its checkout no longer leaves the token in `.git/config`.
- `--sandbox [image]` runs terminal scenes and `verify` steps in a Docker container: only the repository is visible, no network unless `--net`, none of your environment, bounded memory, CPU, processes and time. `app.start` is not covered.
- `plan --audience executive|developer|architecture|walkthrough|demo` for different cuts of the same repository (Claude planner only).
- `bench/run.ts` and `bench/RESULTS.md`: the graph, the offline draft and the evidence check on 20 real repositories. Fixed from what it found: folder imports now follow `package.json` `main`, imported stylesheets and images are no longer counted as unresolved, code quoted inside a string is no longer read as an import, and the draft is valid for a workspace root with a nameless `package.json`.
- This repository's own storyboard cites evidence for every claim, and `.github/workflows/media.yml` re-renders its video on demand.
- `reporeel graph`: modules, top-level symbols and resolved imports for TypeScript, JavaScript and Python, as `graph.json` and a clickable `explore.html`. Static: nothing is run.
- Scenes can cite `evidence` (file, line range, symbol, test). `reporeel check` reports each scene as observed, grounded, unsupported or broken; `video` refuses a storyboard with a broken citation, including a code scene whose lines are not in the file.
- Every render writes `evidence.json` (commit and a hash of each cited range); `check` names the scenes that are out of date with the code.
- `reporeel pr` adds how far the change reaches: modules that depend on the changed files and the test files that reach them.
- `plan` gives Claude the symbol list and sends broken citations back for a fix; the workflow from `reporeel ci` runs `check` on pull requests.
- **Breaking, security:** commands from a storyboard (`terminal` scenes, `app.start`) or a README (`verify`) no longer run unasked. The CLI lists them and asks; `--run` approves up front; without a terminal they are refused. Library callers pass `approve` to `render` and `verify`.
- Those commands no longer inherit credential-like environment variables (`REPOREEL_PASS_ENV` lets named ones through).
- The workflow from `reporeel ci` gives pull requests a read-only token; only the release job can write.
- Storyboards are rejected if a code scene points outside the repository or a web scene is not `http`/`https`.
- `doctor` works on Windows outside a git checkout.
- `doctor` reports a private key only when key material follows the header, so tests that guard against keys are no longer flagged.
- `doctor` finds the one-line description when badges, images or HTML come first.

## 0.2.0

- `reporeel setup` checks Node, ffmpeg, Chromium and keys, and says how to fix each; `--fix` installs Chromium.
- ffmpeg is found on PATH, in `REPOREEL_FFMPEG`, or from the bundled `ffmpeg-static`; ffprobe is no longer needed.
- Unchanged scenes are reused from a cache, so re-rendering after a small fix takes seconds. `--fresh` records everything again.
- `video --only 2,3` renders a preview of just those scenes.
- Videos carry chapters, and scenes dip through black between each other.
- `social` also makes vertical (9:16) and square (1:1) cuts for Reels, Shorts, TikTok and LinkedIn.
- JSON schema for the storyboard (`schema/reporeel.schema.json`), stamped into generated storyboards for editor autocomplete.
- Library API (`import { render, doctor } from '@theharshdubey/reporeel'`) with type declarations.
- End-to-end render test in CI.

## 0.1.0

- First release: `doctor`, `verify`, `plan`, `video`, `dub`, `shots`, `diagram`, `social`, `readme`, `pr`, `ci`, and the agent skill.
