# Changelog

## Unreleased

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
