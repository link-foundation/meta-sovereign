import { webkit } from 'playwright';
import { verifyNativeApplicationLimitWait } from '../../js/tests/helpers/e2e-application-limit-wait.mjs';

// One owned scenario, unchanged deadlines, bounded native controls and no HH traffic.
const browser = await webkit.launch({ headless: true });
const originalContext = browser.newContext.bind(browser);
browser.newContext = async (options) => {
  const context = await originalContext(options);
  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.text().startsWith('[restore-probe]')) {
        console.log(message.text());
      }
    });
    page.on('request', (request) => {
      if (/application/iu.test(request.url())) {
        console.log('[restore-request]', request.url(), request.postData());
      }
    });
    page.on('response', async (response) => {
      if (/application/iu.test(response.url())) {
        console.log(
          '[restore-response]',
          response.status(),
          await response.text().catch(() => 'unavailable')
        );
      }
    });
  });
  await context.addInitScript(() => {
    document.addEventListener(
      'click',
      (event) => {
        const action = event.target.closest('[data-application-action]');
        if (action) {
          console.log(
            '[restore-probe]',
            JSON.stringify({
              action: action.dataset.applicationAction,
              disabled: action.disabled,
              confirmation: document.querySelector(
                '[data-application-option="confirm"]'
              )?.checked,
              waiting: document.querySelector('[data-application-limit-wait]')
                ?.dataset.applicationLimitWait,
            })
          );
        }
      },
      true
    );
  });
  return context;
};
try {
  console.log(
    JSON.stringify(
      await verifyNativeApplicationLimitWait(browser, {
        screenshots: 'docs/screenshots/issue-56-application-background-status',
        backgroundBefore: process.env.APPLICATION_BACKGROUND_BEFORE === '1',
      })
    )
  );
} finally {
  await browser.close();
  console.log('[restore-probe] all browsers closed');
}
