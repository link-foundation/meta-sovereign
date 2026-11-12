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
    for (const onConversation of [false, true, 'callback']) {
      await assert.rejects(
        sender.scanUnreadConversations({ source: 'hh', onConversation }),
        { code: 'bad-chat-scan' }
      );
    }
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
  // These delimiters belong to this fixed fixture, not an HTML sanitizer.
  const start = html.indexOf('<script>') + '<script>'.length;
  const end = html.lastIndexOf('</script>');
  assert.ok(start >= '<script>'.length && end > start);
  assert.doesNotThrow(() => new vm.Script(html.slice(start, end)));
});

test('native history message data cannot end its containing script element', () => {
  const message =
    '</script><script>globalThis.injected = true;</script><b>literal</b>';
  const html = chatNavigationHtml({ latestMessages: { 8: message } });
  assert.equal(html.split('<script>').length - 1, 1);
  assert.equal(html.split('</script>').length - 1, 1);
  const start = html.indexOf('<script>') + '<script>'.length;
  const end = html.lastIndexOf('</script>');
  assert.doesNotThrow(() => new vm.Script(html.slice(start, end)));
  const dataStart = html.indexOf('{"8":');
  const dataEnd = html.indexOf('?.[fixture.chat]', dataStart);
  assert.equal(JSON.parse(html.slice(dataStart, dataEnd))[8], message);
});
