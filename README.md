# reporeel

[![npm](https://img.shields.io/npm/v/@theharshdubey/reporeel?color=ff7a45&label=npm)](https://www.npmjs.com/package/@theharshdubey/reporeel) [![CI](https://github.com/HarshDubey23/reporeel/actions/workflows/ci.yml/badge.svg)](https://github.com/HarshDubey23/reporeel/actions/workflows/ci.yml) ![license](https://img.shields.io/badge/license-MIT-blue)

**Your repo, explained in one command.** reporeel reads a repository and turns it into a narrated video that explains it (the live app, the architecture, the real code, a real test run), then puts that video, a diagram and a chapter list into your README, makes the social preview card, drafts the launch posts, and tells you whether your quickstart actually works.

<!-- reporeel:start -->
<a href="docs/reporeel/reporeel.mp4"><img src="docs/reporeel/reporeel.gif" width="800" alt="Narrated walkthrough of this project"></a>

<sub>Silent preview. ▶ <a href="docs/reporeel/reporeel.mp4">Watch the narrated video</a> · <a href="docs/reporeel/reporeel.srt">captions</a></sub>

<details><summary><b>What the video covers</b></summary>

- **0:00** Most repositories never get understood. A visitor gives the README a few seconds, sees a wall of text, and leaves. reporeel fixes that with one command.
- **0:11** First it scores the repo the way a visitor sees it. This little app gets a D: no demo, no license, no way to know what it does.
- **0:21** Then run reporeel with no arguments. It writes a storyboard, records a narrated video, draws the architecture, makes a social card and updates the README. The score goes up on its own.
- **0:33** Web scenes drive the real app, with a cursor that glides, clicks that ripple, and a camera that zooms in on what matters.
- **0:43** Everything lives in one storyboard file. Title cards, live web, real code, diagrams, terminal runs and numbers. A coding agent writes it, or Claude does, or you do.
- **0:56** The narration is spoken by a free local voice, or by ElevenLabs in Hindi and many other languages. Chrome records sharp frames, and ffmpeg puts it all together.
- **1:08** It also checks that your quickstart really works on a clean checkout, makes videos of pull requests, cuts vertical versions for Reels and LinkedIn, and keeps everything fresh on every release.
- **1:20** reporeel. Make your repo understood. This video was made by reporeel, from this storyboard.

### Chapters

0:00 Your repo, explained in one command.
0:11 $ node bin/reporeel.js doctor --dir examples/hello | head -1
0:21 $ node bin/reporeel.js --dir examples/hello --voice none 2>/
0:33 Web scenes drive the real app, with…
0:43 the whole contract
0:56 How it works
1:08 One tool, thirteen jobs
1:20 npx reporeel

</details>

<details><summary><b>Architecture</b></summary>

<img src="docs/reporeel/architecture.svg" alt="Architecture diagram" width="800">

</details>
<!-- reporeel:end -->

## Quickstart

```bash
npx @theharshdubey/reporeel
```

Run it in any repository. It prints a first-impression score, does the work, and prints the score again.

Or install it once and use the short command everywhere:

```bash
npm i -g @theharshdubey/reporeel
```

```bash
reporeel
```

## Why

A visitor decides about a repository from its README in a few seconds. Most READMEs give them a wall of text and no way to see the thing working. A good demo video fixes that, and nobody makes one, because it means writing a script, recording the app, recording a voice-over, syncing them and keeping all of it current. reporeel does that part.

## What it does

| Command | What you get |
| --- | --- |
| `reporeel` | Everything below in order, with the score before and after |
| `reporeel doctor` | A first-impression score out of 100 with the fix for each gap: README, one-line description, demo media above the fold, quickstart, license, tests, CI, broken links, **committed secrets and `.env` files**, huge files |
| `reporeel verify` | Runs the commands in your README's setup section on a clean clone and tells you the first one that breaks |
| `reporeel plan` | Writes `reporeel.json`, the storyboard. With `ANTHROPIC_API_KEY` Claude reads the repo and writes it; without one you get an offline draft from your manifests and README |
| `reporeel video` | Renders the storyboard: MP4 with voice and chapters, a silent GIF for the README, `.srt` captions, a poster frame and a contact sheet. Unchanged scenes come from a cache; `--only 3` previews one scene in seconds |
| `reporeel diagram` | Architecture diagram as SVG and PNG, from the storyboard or straight from your manifests |
| `reporeel shots` | Screenshots of the running app: desktop and phone, dark and light |
| `reporeel social` | The 1280x640 GitHub social preview card, **vertical (9:16) and square cuts** of the video for Reels, Shorts and the LinkedIn feed, and `LAUNCH.md` with drafts for Show HN, LinkedIn, X and Reddit. Drafts only: it never posts |
| `reporeel readme` | Puts the GIF, the video link, the chapters and the diagram into your README between markers. Re-running replaces its own block and touches nothing else |
| `reporeel pr` | A short video of what the current branch changes: the commit, the size, the changed lines lit up in the code, and the tests run on it |
| `reporeel dub --lang hi` | Translates the narration (Claude) and re-voices the video (ElevenLabs) in Hindi or any other language |
| `reporeel ci` | A GitHub Action that runs `doctor` and `verify` on pull requests and refreshes the media on every release |
| `reporeel setup` | Checks Node, ffmpeg, Chromium and your keys, and tells you how to fix each one; `--fix` installs Chromium |

## The storyboard

Everything the video says and shows lives in `reporeel.json`, so it can be reviewed, diffed and re-rendered when the app changes:

```json
{
  "title": "Readable",
  "app": { "url": "http://localhost:4321/", "start": "node server.js" },
  "voice": { "provider": "kokoro" },
  "scenes": [
    { "type": "title", "heading": "How long will this take to read?", "say": "Readable tells you how long any text takes to read, and how hard it is." },
    { "type": "web", "actions": [{ "type": ["#text", "Paste anything."] }, { "click": "#measure" }, { "zoom": "#result" }], "say": "Paste some text and press measure." },
    { "type": "code", "file": "readable.js", "lines": [1, 10], "highlight": [[8, 8]], "say": "The score is the Flesch reading ease formula." },
    { "type": "terminal", "commands": ["npm test"], "say": "And the tests run, for real." },
    { "type": "end", "heading": "Readable", "links": ["github.com/you/readable"], "say": "Try it yourself." }
  ]
}
```

| Scene | Shows | Notes |
| --- | --- | --- |
| `title` | A title card | The hook |
| `web` | Your running app | Actions: `click`, `type`, `press`, `hover`, `scroll`, `zoom`, `wait`, `waitFor`. The cursor glides, clicks ripple, `zoom` moves the camera onto an element. A scene lasts as long as its narration or its actions, whichever is longer |
| `code` | Real lines from a file | Syntax-highlighted; `highlight` ranges are lit up one after another |
| `diagram` | A Mermaid diagram | Nodes appear as they are talked about |
| `terminal` | Commands and their output | The commands **really run** before recording; a failing test shows as failing |
| `stats` | Big numbers | They count up |
| `end` | Closing card with links | |

Any scene can carry `say_hi`, `say_ta` and so on; `reporeel video --lang hi` uses them.

Generated storyboards start with `"$schema"`, so VS Code and other editors autocomplete every field and underline mistakes. The schema is [`schema/reporeel.schema.json`](schema/reporeel.schema.json); a complete example is [`examples/hello/reporeel.example.json`](examples/hello/reporeel.example.json).

### A fast loop

```bash
npx @theharshdubey/reporeel video --only 3      # preview scene 3 alone, in docs/reporeel/preview.mp4
npx @theharshdubey/reporeel video               # everything; scenes you did not touch are reused
npx @theharshdubey/reporeel video --fresh       # record every scene again
```

## Use it from Claude Code or Codex

Copy `skills/reporeel` into your skills folder (for Claude Code, `~/.claude/skills/`) and ask *"make a demo video of this repo"*. The agent reads the code, starts the app, finds real selectors, writes the storyboard, renders, looks at the contact sheet and fixes what is wrong. No API key is needed, because the agent is the one doing the thinking.

## Voices

| Provider | Cost | Languages | Setup |
| --- | --- | --- | --- |
| `kokoro` (default) | Free, runs on your machine | English | Nothing. The model (about 90 MB) downloads on first use |
| `elevenlabs` | Your ElevenLabs plan | Hindi and many more | `ELEVENLABS_API_KEY` |
| `none` | Free | | Silent video, captions only |

Narration is cached by its text, so re-rendering after a visual fix does not regenerate audio.

## Requirements

Node 22.18 or newer and a Chromium for Playwright. ffmpeg is used from your PATH, from `REPOREEL_FFMPEG`, or from the bundled `ffmpeg-static`. Run this once:

```bash
npx @theharshdubey/reporeel setup --fix
```

## Use it as a library

```js
import { doctor, draft, render } from '@theharshdubey/reporeel';

const report = doctor('.');                       // { score, grade, checks, secrets }
const storyboard = draft('.');                    // or write your own
await render(storyboard, './reporeel.json', { out: 'docs/reporeel' });
```

Type declarations are included.

## How it is built

- Frames come from Chrome's screencast (full-resolution JPEGs), not Playwright's VP8 recorder, so code and UI text stay sharp.
- Each scene is cached by everything that changes how it looks or sounds (its JSON, its narration audio, the code file it shows, the theme), so only edited scenes are recorded again. Web scenes show a live app and are always recorded.
- Chapters are written into the MP4, so players can jump between scenes.
- Built-in scenes are small HTML pages that animate themselves for exactly the length of their narration, recorded the same way as your app.
- A failed web action is reported and skipped instead of killing a two-minute render; an app that will not start drops its web scenes with a warning, and the rest of the video is still made.
- `doctor` and `verify` never run anything from your working tree: `verify` uses a fresh clone, `doctor` only reads files.

## Limits

- The offline `plan` draft is a starting point, not a script. The good videos come from a storyboard written by an agent, by Claude, or by you.
- `verify` runs your README's commands. It skips ones that obviously need a person (`cd`, `export`, placeholders), but read your README before running it on someone else's repository.
- Web scenes need an app that runs locally; apps that need a database or secrets need those set up first.
- GitHub does not autoplay video in a README, which is why the README gets a silent GIF that links to the MP4. To get an inline player, drag the MP4 into the README editor on github.com.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). `npm test` runs the unit tests and an end-to-end render of the example app. `node bin/reporeel.js video` in this repository re-renders the video at the top of this README.

## License

MIT
