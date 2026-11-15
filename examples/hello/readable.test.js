import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measure } from './readable.js';

test('counts words and gives easy text a high score', () => {
  const r = measure('The cat sat on the mat. It was happy.');
  assert.equal(r.words, 9);
  assert.ok(r.grade > 90);
});
