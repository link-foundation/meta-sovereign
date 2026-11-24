import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { questionBrowserServer } from './question-browser-server.mjs';
import {
  mountPendingHistory,
  editPendingMessage,
} from './pending-turn-fixture.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../../js/src/transport/lino.js';

const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
let fixture;
try {
  fixture = await questionBrowserServer(browser);
  const call = async (action, input, type = LINO_TEXT) => {
    const response = await fetch(
      `${fixture.base}/api/automations/answers/browser/${action}`,
      {
        method: 'POST',
        headers: { accept: type, 'content-type': type },
        body: encodeWire(input, type),
      }
    );
    return { status: response.status, value: await readWireResponse(response) };
  };
  const inspect = async () =>
    (await call('inspect', { source: 'hh', chat: '7' })).value;
  let cases = 0;
  for (const type of [LINO_TEXT, LINO_BINARY]) {
    await fixture.reset({ freeText: true });
    await fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
    await fixture.page.evaluate(mountPendingHistory);
    const review = await inspect();
    assert.equal(review.pendingTurn.messages.length, 2);
    const text =
      'Expected salary: 100000. I have distributed systems experience.';
    const result = (
      await call('reply-text', { id: review.id, text, confirm: true }, type)
    ).value;
    assert.equal(result.status, 'sent');
    assert.equal(result.outbox.receipt.text, text);
    assert.equal(result.outbox.receipt.messageId, '102');
    const before = await fixture.stats();
    assert.equal(before.textSends, 1);
    assert.equal(before.clicks, 0);
    assert.equal(
      (await call('status', { id: review.id }, type)).value.status,
      'sent'
    );
    assert.equal(
      (
        await call(
          'reply-text',
          { id: review.id, text: 'Another reply', confirm: true },
          type
        )
      ).value.code,
      'already-sent'
    );
    assert.deepEqual(await fixture.stats(), before);
    console.log(
      JSON.stringify({ case: 'positive-native-receipt', type, before })
    );
    cases += 1;
  }
  await fixture.reset({ freeText: true, receipt: 'none' });
  const uncertain = await inspect();
  const input = {
    id: uncertain.id,
    text: 'Reviewed uncertain response',
    confirm: true,
  };
  assert.equal((await call('reply-text', input)).value.status, 'unknown');
  assert.equal((await call('reply-text', input)).value.code, 'send-in-doubt');
  assert.equal((await fixture.stats()).textSends, 1);
  console.log(
    JSON.stringify({ case: 'uncertain-blocked', stats: await fixture.stats() })
  );
  cases += 1;

  await fixture.reset({ freeText: true, draft: 'Owner draft survives' });
  const owner = await inspect();
  assert.equal(
    (
      await call('reply-text', {
        id: owner.id,
        text: 'Reviewed reply',
        confirm: true,
      })
    ).value.code,
    'question-browser-text'
  );
  assert.deepEqual(await fixture.stats(), {
    clicks: 0,
    textSends: 0,
    draft: 'Owner draft survives',
  });
  console.log(
    JSON.stringify({ case: 'owner-draft', stats: await fixture.stats() })
  );
  cases += 1;

  await fixture.reset({ freeText: true });
  await fixture.send.readAnswerChoices({ source: 'hh', chat: '7' });
  await fixture.page.evaluate(mountPendingHistory);
  const stale = await inspect();
  await fixture.page.evaluate(
    editPendingMessage,
    'Earlier pending question changed'
  );
  const refusal = (
    await call('reply-text', {
      id: stale.id,
      text: 'Stale reply',
      confirm: true,
    })
  ).value;
  assert.equal(refusal.status, 'failed');
  assert.equal((await fixture.stats()).textSends, 0);
  assert.equal((await fixture.stats()).draft, '');
  console.log(
    JSON.stringify({
      case: 'changed-pending-turn',
      code: refusal.code,
      stats: await fixture.stats(),
    })
  );
  cases += 1;
  console.log(JSON.stringify({ cases, result: 'PASS' }));
} finally {
  await fixture?.close();
  await browser.close();
}
