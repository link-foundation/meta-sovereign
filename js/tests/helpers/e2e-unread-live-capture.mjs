import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  withChatNavigationFixture,
  readChatNavigationView,
} from './e2e-chat-navigation.mjs';
import { archiveBrowserHistoryWindow } from '../../src/sources/browser-history-archive.js';
import { createMemoryStore } from '../../src/storage/universal.js';
import {
  withMessageVersions,
  messageVersions,
} from '../../src/storage/message-versions.js';
import { transientMessageFixture } from '../../../experiments/issue-56/transient-message-fixture.mjs';

/** A message disappears between polling reads inside an owned inactive visit. */
export const verifyUnreadLiveCapture = async (
  browser,
  { screenshots, before = false } = {}
) => {
  let outcome;
  await withChatNavigationFixture(
    browser,
    {},
    async ({ sender, page, original }) => {
      const settings = {
        source: 'hh',
        maxChats: 1,
        waitMs: 100,
        endWaitMs: 100,
        budgetMs: 30000,
      };
      if (browser.browserType().name() !== 'chromium') {
        await assert.rejects(sender.scanUnreadConversations(settings), {
          code: 'browser-background-focus-unavailable',
        });
        outcome = 'unsupported-focus-refused';
        return;
      }
      const store = withMessageVersions(createMemoryStore());
      const result = await sender.scanUnreadConversations({
        ...settings,
        onHistoryWindow: (window) =>
          archiveBrowserHistoryWindow(store, { ...window, source: 'hh' }),
        onConversation: async (observation, handle) => {
          assert.equal(observation.chat, '8');
          assert.equal(handle.snapshot.chat, '8');
          await page.evaluate(transientMessageFixture, {
            root: '#messages',
            id: '899',
          });
        },
      });
      const saved = await store.get('msg:hh:8:899');
      const versions = saved
        ? (await messageVersions(store, saved.id)).versions.map(
            (version) => version.snapshot.body
          )
        : [];
      const view = await readChatNavigationView(page);
      const observerReleased = await page.evaluate(
        () => !window[Symbol.for('meta-sovereign.browser-history-observer.v1')]
      );
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.locator('#result').evaluate(
          (node, receipt) => {
            node.textContent = JSON.stringify(receipt, null, 2);
          },
          {
            liveProvider: false,
            transientMessage: saved?.body ?? null,
            delivery: saved?.delivery ?? null,
            versions,
            restored: result.restoration.restored,
            sends: view.sends,
            observerReleased,
          }
        );
        await page.screenshot({
          path: join(screenshots, before ? 'before.png' : 'after.png'),
          fullPage: true,
        });
      }
      assert.equal(
        saved?.body,
        'Final answer',
        'transient unread message retained'
      );
      assert.equal(saved.delivery, 'delivered');
      assert.deepEqual(
        new Set(versions),
        new Set(['First answer', 'Edited answer', 'Final answer'])
      );
      assert.equal(result.restoration.restored, true);
      assert.deepEqual(view, original);
      assert.equal(observerReleased, true);
      outcome = 'transient-edits-delivery-drained-before-view-restoration';
    }
  );
  return { cases: 1, outcome, liveProvider: false };
};
