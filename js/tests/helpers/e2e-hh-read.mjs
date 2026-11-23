import assert from 'node:assert/strict';

const prepareRead = async (page, mode) => {
  await page.evaluate((mode) => {
    const chat = document.createElement('aside');
    chat.dataset.qa = 'chatik-open-chat-7';
    chat.innerHTML =
      '<span data-qa="chat-cell-title">Example employer</span><span data-qa="chat-cell-counter">2</span>';
    document.body.prepend(chat);
    const badge = chat.querySelector('[data-qa="chat-cell-counter"]');
    const message = document.querySelector(
      '[data-qa="chatik-chat-message-101"]'
    );
    message.scrollIntoView = () => {
      message.dataset.receiptRequested = '';
      if (mode === 'new-message') {
        const replacement = message.cloneNode(true);
        replacement.dataset.qa = 'chatik-chat-message-102';
        message.after(replacement);
        badge.textContent = '1';
      } else {
        badge.remove();
      }
    };
    if (mode === 'uncounted') {
      badge.textContent = '99+';
    }
  }, mode);
};

export const verifyHhNativeRead = async ({
  run,
  reset,
  page,
  sender,
  args,
}) => {
  const request = { ...args, id: '101' };
  await run(
    'native HH read requires a fresh badge in the verified chat',
    async () => {
      await reset();
      await prepareRead(page, 'acknowledged');
      const result = await sender.markRead(request);
      assert.equal(result.read, true);
      assert.equal(result.readState?.id, 'read:hh:7');
      assert.equal(result.readState.unreadCount, 0);
      assert.equal(result.readState.hhLatestMessageId, '101');
      assert.equal(await page.locator('[data-receipt-requested]').count(), 1);
    }
  );
  await run('native HH read retains a concurrent unread arrival', async () => {
    await reset();
    await prepareRead(page, 'new-message');
    const result = await sender.markRead(request);
    assert.equal(result.read, false);
    assert.equal(result.readState.unreadCount, 1);
    assert.equal(result.readState.hhLatestMessageId, '102');
  });
  await run(
    'native HH read refuses a stale boundary and uncounted badge',
    async () => {
      await reset();
      await prepareRead(page, 'uncounted');
      await assert.rejects(sender.markRead(request), {
        code: 'read-unconfirmed',
      });
      await page.locator('[data-qa="chat-cell-counter"]').evaluate((badge) => {
        badge.textContent = '2';
      });
      await assert.rejects(sender.markRead({ ...request, id: '100' }), {
        code: 'history-changed',
      });
      assert.equal(await page.locator('[data-receipt-requested]').count(), 0);
    }
  );
  await run(
    'native HH read leaves a different open conversation intact',
    async () => {
      await reset();
      await prepareRead(page, 'acknowledged');
      await assert.rejects(sender.markRead({ ...request, chat: '8' }), {
        code: 'answer-chat-unverified',
      });
      assert.equal(page.url(), 'https://hh.ru/chat/7');
      assert.equal(await page.locator('[data-receipt-requested]').count(), 0);
    }
  );
};
