import assert from 'node:assert/strict';
import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { applicationNativeFixture } from './application-native-fixture.mjs';
import { wirePost } from '../../js/tests/helpers/vacancy-routes.mjs';
import { LINO_TEXT } from '../../js/src/transport/lino.js';

const outcomes = [];
await serveNativeMcpFixture(
  (browser) =>
    applicationNativeFixture(browser, {
      onApplicationClose: (value) => outcomes.push(value),
    }),
  () => ({ outcomes }),
  async (fixture) => {
    const input = {
      url: 'https://hh.ru/vacancy/123',
      requestId: 'applied-cache-mcp',
      autoSelectResumeLanguage: false,
    };
    let receipt = await wirePost(
      fixture.base,
      'application-open',
      input,
      LINO_TEXT
    );
    for (const [operation, extra] of [
      ['application-advance', { action: 'enter', confirm: true }],
      ['application-prefill', { confirm: true }],
      ['application-advance', { action: 'submit', confirm: true }],
      ['application-close', {}],
    ]) {
      assert.equal(receipt.status, 200);
      receipt = await wirePost(
        fixture.base,
        operation,
        { ...input, revision: receipt.value.revision, ...extra },
        LINO_TEXT
      );
    }
    assert.equal(receipt.status, 200);
    assert.equal(receipt.value.delivery, 'provider-confirmed');
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].attempts, 1);
  }
);
