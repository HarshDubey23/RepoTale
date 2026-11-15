---
name: reporeel
description: Make a repository understood. Writes and renders a narrated explainer video of the project (live app, architecture, real code, real test runs), adds it to the README with a diagram, scores the repo's first impression, checks that the README's quickstart actually works, and drafts launch posts. Use when the user asks for a demo video, a project walkthrough, a better README, "make my repo look good", a launch, or a video of a PR.
---

# reporeel

You are the brain; the `reporeel` CLI does the rendering. You read the repository and write the
storyboard, because you can read the code and click through the app. No API key is needed.

## 1. Look before you write

```bash
npx -y @theharshdubey/reporeel doctor
```

Then read the README, the manifests and the entry points. Work out: what problem it solves, for whom,
how to run it, what the most convincing thing to *show* is, and which numbers the repo actually states.

## 2. Write `reporeel.json`

Start the file with `"$schema": "https://raw.githubusercontent.com/HarshDubey23/reporeel/main/schema/reporeel.schema.json"`.
Shape:

```json
{
  "title": "Project", "repo": ".",
  "app": { "url": "http://localhost:3000/", "start": "npm run dev" },
  "voice": { "provider": "kokoro", "voice": "am_michael" },
  "theme": { "accent": "#ff7a45" },
  "scenes": [
    { "type": "title", "heading": "…", "sub": "…", "say": "…" },
    { "type": "web", "url": "/", "actions": [{ "click": "text=Try it" }, { "waitFor": "#result" }, { "zoom": "#result" }], "say": "…" },
    { "type": "diagram", "mermaid": "flowchart LR\n  A --> B", "say": "…" },
    { "type": "code", "file": "src/core.ts", "lines": [10, 38], "highlight": [[14, 20]], "say": "…" },
    { "type": "terminal", "commands": ["npm test"], "say": "…" },
    { "type": "stats", "items": [{ "value": "0 / 240", "label": "attacks that got through" }], "say": "…" },
    { "type": "end", "heading": "Project", "links": ["github.com/you/project"], "say": "…" }
  ]
}
```

Rules that make the video good:
- 6 to 9 scenes, 60 to 120 seconds. Problem, product working, how it works, proof, where to get it.
- Every claim, number, path and line range comes from the repo. Never invent a metric.
- Show, don't tell: a `web` scene if there is a UI, a `terminal` scene for CLIs and tests.
- Narration is for the ear: short sentences, no markdown, symbols spelled out.
- Before writing a `web` scene, start the app and find selectors that exist (use the Playwright MCP
  tools if you have them, or read the components). Prefer `text=…`, ids and `data-testid`.
- Terminal commands must finish in under two minutes.

## 3. Render and review

```bash
npx -y @theharshdubey/reporeel video --run
```

Open `docs/reporeel/sheet.png` (one frame per scene) and look at it. To check one scene quickly,
`npx -y @theharshdubey/reporeel video --only 4` writes `docs/reporeel/preview.mp4`; unchanged scenes are reused from
the cache on the next full render. Fix what is wrong in the
storyboard (blank web scene, wrong selector, code that is not the interesting part, a caption
covering content) and render again. Narration is cached, so re-renders are fast. Watch the warnings:
a failed action is reported and skipped, not fatal.

## 4. Ship it

```bash
npx -y @theharshdubey/reporeel diagram && npx -y @theharshdubey/reporeel social && npx -y @theharshdubey/reporeel readme && npx -y @theharshdubey/reporeel doctor
```

Then run `npx -y @theharshdubey/reporeel verify`: it lists the README's commands and refuses to run them. Read them, and only if they are safe run it again with `--run`, and fix the README if its quickstart is broken. Tell the user the
score before and after, show them the GIF, and point them to `docs/reporeel/LAUNCH.md` (drafts only:
never post anything for them). If they want another language: add `say_hi` (etc.) to every scene
yourself and run `npx -y @theharshdubey/reporeel video --lang hi` (needs `ELEVENLABS_API_KEY`).

For a pull request: `npx -y @theharshdubey/reporeel pr --base main`.
