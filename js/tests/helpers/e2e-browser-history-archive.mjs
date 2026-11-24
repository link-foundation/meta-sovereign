import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../../src/storage/lino-store.js';
import { withCausalWrites } from '../../src/storage/causal-writes.js';
import { withMessageVersions } from '../../src/storage/message-versions.js';
import { archiveBrowserHistoryWindow } from '../../src/sources/browser-history-archive.js';
import { withHhBrowserScanFixture } from './e2e-hh-chat-scan.mjs';
import {
  withChatNavigationFixture,
  readChatNavigationView,
} from './e2e-chat-navigation.mjs';
import {
  conversationHistoryHtml,
  conversationHistoryIds,
} from '../../../experiments/issue-56/conversation-history-fixture.mjs';

const options = {
  source: 'hh',
  chat: '7',
  waitMs: 30,
  endWaitMs: 100,
  budgetMs: 5000,
};

/** Real DOM windows flush to a private Lino store before virtualization removes them. */
export const verifyBrowserHistoryArchive = async (browser) => {
  const dir = await mkdtemp(join(tmpdir(), 'browser-history-archive-'));
  const file = join(dir, 'history.lino');
  let disk = await createLinoTextStore(file);
  const store = withMessageVersions(withCausalWrites(disk));
  const outcomes = [];
  try {
    await withHhBrowserScanFixture(
      browser,
      { html: conversationHistoryHtml() },
      async ({ sender }) => {
        let windows = 0;
        const result = await sender.scanConversation({
          ...options,
          onHistoryWindow: async (window) => {
            windows++;
            await archiveBrowserHistoryWindow(store, {
              ...window,
              source: 'hh',
            });
            for (const row of window.rows) {
              assert.equal(
                (await store.get(`msg:hh:7:${row.id}`)).body,
                row.body
              );
            }
          },
        });
        assert.equal(result.coverage.complete, true);
        assert.ok(windows > 1);
        assert.equal((await store.get('msg:hh:7:92')).outgoing, true);
        outcomes.push('native-window-checkpoints');
      }
    );
    await disk.close();
    disk = await createLinoTextStore(file);
    assert.deepEqual(
      new Set(
        (await disk.query((row) => row.id.startsWith('msg:hh:7:'))).map(
          (row) => row.id
        )
      ),
      new Set(conversationHistoryIds.map((id) => `msg:hh:7:${id}`))
    );
    assert.equal((await disk.get('msg:hh:7:13')).service, true);
    outcomes.push('all-native-rows-survive-reopen');
    if (browser.browserType().name() === 'chromium') {
      await withChatNavigationFixture(
        browser,
        {},
        async ({ sender, page, original }) => {
          let windows = 0;
          await assert.rejects(
            sender.scanUnreadConversations({
              ...options,
              maxChats: 2,
              budgetMs: 30000,
              onHistoryWindow: async () => {
                windows++;
                throw new Error('Private failed-write fixture');
              },
            }),
            (error) => {
              assert.equal(error.code, 'question-history-save-failed');
              assert.equal(error.restoration.restored, true);
              assert.equal(error.restoration.reason, 'checked');
              assert.ok(Object.values(error.restoration.fields).every(Boolean));
              assert.equal(
                error.message.includes('Private failed-write'),
                false
              );
              return true;
            }
          );
          assert.equal(windows, 1);
          assert.deepEqual(await readChatNavigationView(page), original);
        }
      );
      outcomes.push('refused-write-restores-unread-owner');
    }
    return { cases: outcomes.length, outcomes, liveProvider: false };
  } finally {
    await disk.close();
    await rm(dir, { recursive: true, force: true });
  }
};
