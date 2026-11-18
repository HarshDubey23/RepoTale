// `reporeel ci`: a workflow that keeps the repo's first impression honest: doctor + verify on every
// pull request (read-only token), and a fresh video, diagram and social card on every release.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeWorkflow(root: string) {
  const file = join(root, '.github', 'workflows', 'reporeel.yml');
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(file, `# Written by reporeel ci. Edit freely.
name: reporeel
on:
  pull_request:
  release:
    types: [published]
  workflow_dispatch:
# onnxruntime-node (the local voice) tries to fetch a CUDA build on Linux; reporeel only needs the CPU one.
env:
  ONNXRUNTIME_NODE_INSTALL_CUDA: skip
# Pull requests are untrusted: they get a read-only token. Only the release job can write.
permissions:
  contents: read
jobs:
  check:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        # Keep the token out of .git/config, where commands run below could read it.
        with: { persist-credentials: false }
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx -y @theharshdubey/reporeel doctor --min 60
      # Reads only: fails when the storyboard cites a file, line range, symbol or test this change removed.
      - run: npx -y @theharshdubey/reporeel check
      # verify runs the README's setup commands, and a pull request can change the README. So they run
      # only for branches of this repository, never for a fork's pull request, and even then inside a
      # Docker container: it sees a clean clone and nothing else of the runner (no environment, no
      # checkout credentials, no home folder), with memory, CPU, process and time limits. The network
      # is on (--net) because installing dependencies needs it. Without Docker the step fails; it never
      # falls back to running on the runner itself.
      - if: github.event.pull_request.head.repo.full_name == github.repository
        run: npx -y @theharshdubey/reporeel verify --run --sandbox node:22-slim --net
      - if: github.event.pull_request.head.repo.full_name != github.repository
        run: echo "::notice::README commands were not run, because this pull request comes from a fork."
  refresh:
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: sudo apt-get update && sudo apt-get install -y ffmpeg && npx -y playwright install --with-deps chromium
      - run: npx -y @theharshdubey/reporeel video --run && npx -y @theharshdubey/reporeel diagram && npx -y @theharshdubey/reporeel social && npx -y @theharshdubey/reporeel readme
        env:
          ELEVENLABS_API_KEY: \${{ secrets.ELEVENLABS_API_KEY }}
      - name: Commit the refreshed media
        run: |
          git config user.name "reporeel"
          git config user.email "reporeel@users.noreply.github.com"
          git add docs/reporeel README.md
          git diff --cached --quiet || git commit -m "docs: refresh reporeel media" && git push
`);
  return file;
}
