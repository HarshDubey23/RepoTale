import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upsertBlock } from '../src/readme.ts';
import { commandsFrom } from '../src/verify.ts';

test('the README block goes after the intro and is replaced, not duplicated, on re-run', () => {
  const md = '# Tool\n\nWhat it does.\nMore.\n\n## Install\n\nnpm i\n';
  const once = upsertBlock(md, 'A');
  assert.match(once, /More\.\n\n<!-- reporeel:start -->\nA\n<!-- reporeel:end -->\n\n## Install/);
  const twice = upsertBlock(once, 'B');
  assert.equal(twice.match(/reporeel:start/g)!.length, 1);
  assert.match(twice, /\nB\n/);
  assert.doesNotMatch(twice, /\nA\n/);
});

test('verify picks the commands from setup sections and skips the ones that need a person', () => {
  const md = '# x\n\n```bash\nrm -rf /\n```\n\n## Quickstart\n\n```bash\n$ git clone https://x\ncd x\nnpm ci\n# comment\nnpm test\n```\n\n```js\nconsole.log(1)\n```\n';
  assert.deepEqual(commandsFrom(md), ['git clone https://x', 'cd x', 'npm ci', 'npm test']);
});
