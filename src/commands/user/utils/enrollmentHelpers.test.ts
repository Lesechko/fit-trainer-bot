import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPaidStartUrl } from './accessCodeFormat';
import { parseDelayToMs } from './delayUtils';

describe('parseDelayToMs', () => {
  it('parses minutes, hours, and days', () => {
    assert.equal(parseDelayToMs('20min'), 20 * 60 * 1000);
    assert.equal(parseDelayToMs('2h'), 2 * 60 * 60 * 1000);
    assert.equal(parseDelayToMs('1d'), 24 * 60 * 60 * 1000);
  });

  it('trims and lowercases input', () => {
    assert.equal(parseDelayToMs(' 30MIN '), 30 * 60 * 1000);
  });

  it('rejects invalid formats', () => {
    assert.equal(parseDelayToMs(''), null);
    assert.equal(parseDelayToMs('20'), null);
    assert.equal(parseDelayToMs('20m'), null);
    assert.equal(parseDelayToMs('min20'), null);
    assert.equal(parseDelayToMs('1.5h'), null);
  });
});

describe('buildPaidStartUrl', () => {
  it('builds paid- deep link for WayForPay return URL docs', () => {
    assert.equal(
      buildPaidStartUrl('MarGoTraining_bot', 'healthy-joints'),
      'https://t.me/MarGoTraining_bot?start=paid-healthy-joints'
    );
  });
});
