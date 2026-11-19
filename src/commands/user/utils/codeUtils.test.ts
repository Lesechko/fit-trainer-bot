import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateAccessCode } from './accessCodeFormat';

describe('generateAccessCode', () => {
  it('returns a non-empty alphanumeric code of expected length', () => {
    const code = generateAccessCode();
    assert.equal(typeof code, 'string');
    assert.ok(code.length >= 8);
    assert.ok(code.length <= 16);
    assert.match(code, /^[a-z0-9]+$/);
  });

  it('produces distinct values across calls (with high probability)', () => {
    const a = generateAccessCode();
    const b = generateAccessCode();
    assert.notEqual(a, b);
  });
});
