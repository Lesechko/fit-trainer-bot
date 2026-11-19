import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Context } from 'telegraf';

import { getCallbackData } from './callbackData';

function ctxWithCallbackData(data: unknown): Context {
  return {
    callbackQuery: { data },
  } as Context;
}

describe('getCallbackData', () => {
  it('returns string callback_data', () => {
    assert.equal(
      getCallbackData(ctxWithCallbackData('restart_1_ABC')),
      'restart_1_ABC'
    );
  });

  it('returns undefined when callback query or data is missing', () => {
    assert.equal(getCallbackData({} as Context), undefined);
    assert.equal(
      getCallbackData({ callbackQuery: {} } as Context),
      undefined
    );
    assert.equal(getCallbackData(ctxWithCallbackData(123)), undefined);
  });
});
