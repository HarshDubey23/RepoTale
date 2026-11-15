// `reporeel ci`: a workflow that keeps the repo's first impression honest: doctor + verify on every
// pull request, and a fresh video, diagram and social card on every release.
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
permissions:
  contents: write
jobs:
  check:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx -y @theharshdubey/reporeel doctor --min 60
      - run: npx -y @theharshdubey/reporeel verify
  refresh:
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: sudo apt-get update && sudo apt-get install -y ffmpeg && npx -y playwright install --with-deps chromium
      - run: npx -y @theharshdubey/reporeel video && npx -y @theharshdubey/reporeel diagram && npx -y @theharshdubey/reporeel social && npx -y @theharshdubey/reporeel readme
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
