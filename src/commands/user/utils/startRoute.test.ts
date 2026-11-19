import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveStartRoute } from './startRoute';

describe('resolveStartRoute', () => {
  it('asks for a course access code on bare /start', () => {
    assert.deepEqual(resolveStartRoute(null), { kind: 'ask_code' });
    assert.deepEqual(resolveStartRoute(''), { kind: 'ask_code' });
  });

  it('soft-lands platform members without enroll', () => {
    assert.deepEqual(resolveStartRoute('member'), { kind: 'member' });
  });

  it('keeps course deep links and access codes', () => {
    assert.deepEqual(resolveStartRoute('site-healthy-joints'), {
      kind: 'site',
      slug: 'healthy-joints',
    });
    assert.deepEqual(resolveStartRoute('paid-healthy-joints'), {
      kind: 'paid',
      slug: 'healthy-joints',
    });
    assert.deepEqual(resolveStartRoute('instagram-healthy-joints'), {
      kind: 'instagram',
      slug: 'healthy-joints',
    });
    assert.deepEqual(resolveStartRoute('ABC123'), {
      kind: 'access_code',
      code: 'ABC123',
    });
  });

  it('does not treat incomplete prefixes as course routes', () => {
    assert.deepEqual(resolveStartRoute('site-'), {
      kind: 'access_code',
      code: 'site-',
    });
    assert.deepEqual(resolveStartRoute('paid-'), {
      kind: 'access_code',
      code: 'paid-',
    });
    assert.deepEqual(resolveStartRoute('member-extra'), {
      kind: 'access_code',
      code: 'member-extra',
    });
  });
});
