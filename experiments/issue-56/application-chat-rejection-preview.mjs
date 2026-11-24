import assert from 'node:assert/strict';
import { withChatNavigationFixture } from '../../js/tests/helpers/e2e-chat-navigation.mjs';
import { withBrowserChatNavigation } from '../../js/src/sources/browser-chat-navigation.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';
import { chatNavigationHtml } from './chat-navigation-fixture.mjs';

const rejection = 'We will not move forward with your application.';
export const verifyChangedRejectionPreview = async (browser) => {
  if (browser.browserType().name() !== 'chromium') {
    return { platformGuardCoveredByWorker: true };
  }
  return withChatNavigationFixture(
    browser,
    { html: chatNavigationHtml({ listPreviews: { 9: rejection } }) },
    async ({ page, commander }) => {
      const nativePreview = page
        .locator('[data-qa="chatik-open-chat-9"]')
        .locator('[data-qa="chat-last-message"]');
      await withBrowserChatNavigation(
        { commander, page, ui: HH_WEB_UI },
        async ({ visit }) => {
          assert.equal(await nativePreview.textContent(), rejection);
          await nativePreview.evaluate((preview) => {
            preview.textContent = 'Could you send your availability?';
          });
          const outcome = await visit('9', () => assert.fail(), rejection);
          assert.equal(outcome, undefined);
          assert.equal(
            await page.evaluate(() => globalThis.fixture.unread['9']),
            1
          );
          const visited = await visit('8', (_document, chat) => chat);
          assert.equal(visited, '8');
          return { nativeVisit: visited };
        }
      );
      const provider = await page.evaluate(() => globalThis.fixture);
      assert.equal(provider.chat, '7');
      assert.equal(provider.sends, 0);
      assert.deepEqual(provider.visits, ['8']);
      return { staleRead: false, nativeVisit: '8', restored: '7' };
    }
  );
};
