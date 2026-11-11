import assert from 'node:assert/strict';
import { providerChoiceDraft } from '../../../experiments/issue-56/provider-choice-fixture.mjs';

/** Reuse the native HH fixture for current-document leases, including real frames. */
export const verifyHhChoiceWatch = async ({
  run,
  page,
  sender,
  args,
  appArgs,
  openApp,
  frame,
  mount,
  counters,
}) => {
  await run(
    'watch binds a cross-origin application frame and releases every page listener',
    async () => {
      await openApp();
      await mount(frame());
      const events = ['framenavigated', 'framedetached', 'close'];
      const before = events.map((event) => page.listenerCount(event));
      const watch = await sender.openAnswerWatch(appArgs);
      try {
        const current = await watch.read();
        assert.deepEqual(current.answerOptions, ['Yes.', 'No.']);
        const selected = await watch.select(
          providerChoiceDraft(),
          async () => {}
        );
        assert.equal(selected.messageId, '102');
        assert.deepEqual(await counters(frame()), { clicks: 1, text: 0 });
      } finally {
        await watch.close();
      }
      assert.deepEqual(
        events.map((event) => page.listenerCount(event)),
        before
      );
      await assert.rejects(watch.read(), {
        code: 'question-watch-page-changed',
      });
    }
  );
  await run(
    'watched frame reload and hidden ownership refuse without reopening the application',
    async () => {
      await openApp();
      await mount(frame());
      const watch = await sender.openAnswerWatch(appArgs);
      try {
        await frame().goto('https://chatik.hh.ru/chat/7');
        await assert.rejects(watch.read(), {
          code: 'question-watch-page-changed',
        });
        assert.equal(page.url(), appArgs.browserUrl);
        assert.deepEqual(await counters(frame()), { clicks: 0, text: 0 });
      } finally {
        await watch.close();
      }
      await mount(frame());
      const visible = await sender.openAnswerWatch(appArgs);
      try {
        await page.locator('iframe').evaluate((element) => {
          element.hidden = true;
        });
        await assert.rejects(visible.read(), {
          code: 'answer-chat-unverified',
        });
        assert.deepEqual(await counters(frame()), { clicks: 0, text: 0 });
      } finally {
        await visible.close();
      }
    }
  );
  await run(
    'a watched main chat never navigates back after the owner changes chats',
    async () => {
      await page.goto('https://hh.ru/chat/7');
      await sender.readAnswerChoices(args);
      await mount();
      const watch = await sender.openAnswerWatch(args);
      try {
        await page.goto('https://hh.ru/chat/8');
        await assert.rejects(watch.read(), {
          code: 'question-watch-page-changed',
        });
        assert.equal(page.url(), 'https://hh.ru/chat/8');
        assert.deepEqual(await counters(), { clicks: 0, text: 0 });
      } finally {
        await watch.close();
      }
    }
  );
};
