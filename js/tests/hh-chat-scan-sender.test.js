import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserSender } from '../src/sources/browser-sender.js';

test('public scanner validates capability, bounds and cancellation before launching a browser', async () => {
  let opened = 0;
  const sender = createBrowserSender({
    openSession: async () => {
      opened++;
      throw new Error('unexpected launch');
    },
  });
  try {
    for (const limit of [0, -1, 5001, '10', 1.5, Number.NaN]) {
      await assert.rejects(sender.scanChats({ source: 'hh', limit }), {
        code: 'bad-chat-scan',
      });
    }
    for (const unreadOnly of [null, 1, 'true', 'false']) {
      await assert.rejects(sender.scanChats({ source: 'hh', unreadOnly }), {
        code: 'bad-chat-scan',
      });
    }
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      sender.scanChats({ source: 'hh', signal: controller.signal }),
      { code: 'cancelled' }
    );
    await assert.rejects(sender.scanChats({ source: 'vk' }), {
      code: 'unsupported-action',
    });
    assert.equal(opened, 0);
  } finally {
    await sender.close();
  }
});

for (const method of ['scanChats', 'scanConversation']) {
  test(`a queued ${method} cancellation refuses before acquiring or navigating`, async () => {
    let releaseRead;
    let entered;
    const held = new Promise((resolve) => {
      releaseRead = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    let navigations = 0;
    let reads = 0;
    const sender = createBrowserSender({
      loginTimeoutMs: 500,
      pollMs: 1,
      openSession: async () => ({
        commander: {
          goto: async () => {
            navigations++;
          },
          count: async ({ selector }) =>
            selector === '[data-qa^="chatik-chat-message-"]' ? 1 : 0,
          evaluate: async () => {
            reads++;
            entered();
            await held;
            return [];
          },
        },
        close: async () => {},
      }),
    });
    const first = sender.readChats({ source: 'hh', chat: '7' });
    try {
      await started;
      const controller = new AbortController();
      const queued = sender[method]({
        source: 'hh',
        chat: '7',
        signal: controller.signal,
      });
      const refusal = assert.rejects(queued, { code: 'cancelled' });
      controller.abort();
      releaseRead();
      await Promise.all([first, refusal]);
      assert.equal(navigations, 1);
      assert.equal(reads, 1);
    } finally {
      releaseRead();
      await first;
      await sender.close();
    }
  });

  test(`closing drains queued ${method} and permanently closes admission`, async () => {
    let opened = 0;
    const sender = createBrowserSender({
      openSession: async () => {
        opened++;
        throw new Error('unexpected launch');
      },
    });
    const refused = assert.rejects(
      sender[method]({ source: 'hh', chat: '7' }),
      {
        code: 'cancelled',
      }
    );
    await sender.close();
    await refused;
    await assert.rejects(sender[method]({ source: 'hh', chat: '7' }), {
      code: 'browser-closed',
    });
    await sender.close();
    assert.equal(opened, 0);
  });
}
