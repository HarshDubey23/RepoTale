# Changelog

## Unreleased

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
