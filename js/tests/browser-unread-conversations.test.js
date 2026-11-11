import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createBrowserSender } from '../src/sources/browser-sender.js';
import { chatNavigationHtml } from '../../experiments/issue-56/chat-navigation-fixture.mjs';

test('unread passes require explicit bounded existing-view admission before opening a browser', async () => {
  let opens = 0;
  const sender = createBrowserSender({
    openSession: async () => {
      opens++;
      assert.fail();
    },
  });
  try {
    for (const maxChats of [0, 101, -1, 1.1, '1', NaN]) {
      await assert.rejects(
        sender.scanUnreadConversations({ source: 'hh', maxChats }),
        { code: 'bad-chat-scan' }
      );
    }
    await assert.rejects(
      sender.scanUnreadConversations({ source: 'hh', unreadOnly: false }),
      { code: 'bad-chat-scan' }
    );
    await assert.rejects(sender.scanUnreadConversations({ source: 'hh' }), {
      code: 'browser-view-unavailable',
    });
    await assert.rejects(sender.scanUnreadConversations({ source: 'vk' }), {
      code: 'unsupported-action',
    });
    const stop = new AbortController();
    stop.abort();
    await assert.rejects(
      sender.scanUnreadConversations({ source: 'hh', signal: stop.signal }),
      { code: 'cancelled' }
    );
    assert.equal(opens, 0);
  } finally {
    await sender.close();
  }
  await assert.rejects(sender.scanUnreadConversations({ source: 'hh' }), {
    code: 'browser-closed',
  });
});

test('the finite native-history fixture compiles before any browser is started', () => {
  const html = chatNavigationHtml();
  assert.doesNotThrow(
    () => new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1])
  );
});
