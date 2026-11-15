import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { validate } from '../src/storyboard.ts';

const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false });
const check = ajv.compile(JSON.parse(readFileSync('schema/reporeel.schema.json', 'utf8')));

test('the JSON schema and the built-in validator agree on the real storyboards', () => {
  for (const f of ['reporeel.json', 'examples/hello/reporeel.example.json']) {
    const sb = JSON.parse(readFileSync(f, 'utf8'));
    assert.deepEqual(validate(sb), [], f);
    assert.ok(check(sb), `${f}: ${ajv.errorsText(check.errors)}`);
  }
});

test('both reject a scene with no narration and an unknown action', () => {
  const bad = { title: 'x', scenes: [{ type: 'web', url: 'https://x.dev', actions: [{ tap: '#a' }] }] };
  assert.equal(check(bad), false);
  assert.match(validate(bad).join('\n'), /say.*required[\s\S]*actions\[0\]/);
});
