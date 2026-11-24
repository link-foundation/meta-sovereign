import assert from 'node:assert/strict';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyNativeApplicationChatSession as verifyBatchSession } from '../../js/tests/helpers/e2e-application-chats.mjs';
import { verifyNativeApplicationChatWaiting } from '../../js/tests/helpers/e2e-application-chat-waiting.mjs';
import { withHhBrowserScanFixture } from '../../js/tests/helpers/e2e-hh-chat-scan.mjs';
import {
  signInFixture,
  signedOutRoute,
} from '../../js/tests/helpers/application-chats-browser-fixture.mjs';

// Sign-in preparation is independent of the CDP-based background chat scan.
const verifySessionPreparation = (browser) =>
  withHhBrowserScanFixture(
    browser,
    {
      routePage: (route) =>
        signedOutRoute(route, route.request().frame().page().context()),
    },
    async ({ sender, page }) => {
      const { reuseApplicationChatSession } =
        await import('../../js/src/jobs/application-chat-session.js');
      const context = await browser.newContext();
      try {
        await context.route('**/*', (route) =>
          route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><a data-qa="mainmenu_applicantProfilePage" href="/applicant/resumes">Synthetic applicant</a>',
          })
        );
        await signInFixture(context);
        const application = await context.newPage();
        await application.goto('https://hh.ru/vacancy/123');
        const signal = new AbortController().signal;
        const authenticate = (destination) =>
          reuseApplicationChatSession({
            applicationPage: () => application,
            destination,
            signal,
            waitMs: 0,
          });
        await assert.rejects(
          sender.prepareUnreadConversations({ source: 'hh' }),
          {
            code: 'login-required',
          }
        );
        const email = page.getByRole('textbox', { name: 'Email' });
        await email.fill('owner@example.test');
        assert.equal(await authenticate(page), false);
        assert.equal(await email.inputValue(), 'owner@example.test');
        await email.clear();
        await page.locator('form').evaluate((form) => {
          form.insertAdjacentHTML('beforeend', '<input name="captcha">');
        });
        assert.equal(await authenticate(page), false);
        await page
          .locator('[name="captcha"]')
          .evaluate((input) => input.remove());
        const ready = await sender.prepareUnreadConversations({
          source: 'hh',
          signal,
          authenticate: async (destination) => {
            assert.equal(await authenticate(destination), true);
            return true;
          },
        });
        assert.equal(page.url(), 'https://hh.ru/chat');
        assert.equal(ready.sessionReused, true);
        return {
          sessionReused: true,
          enteredLoginPreserved: true,
          challengePreserved: true,
          liveProvider: false,
        };
      } finally {
        await context.close();
      }
    }
  );

const verifyNativeApplicationChatSession = (browser) =>
  browser.browserType().name() === 'chromium'
    ? verifyBatchSession(browser)
    : verifySessionPreparation(browser);

await runBrowserScenarios(
  'application-chat-session',
  [verifyNativeApplicationChatSession, verifyNativeApplicationChatWaiting],
  { nativeFocus: true }
);
