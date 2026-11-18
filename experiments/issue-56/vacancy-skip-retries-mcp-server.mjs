import { applicationNativeFixture } from './application-native-fixture.mjs';
import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import { vacancySkipId } from '../../js/src/jobs/vacancy-skip-data.js';

let fixture;
let browser;
const outcomes = [];
await serveNativeMcpFixture(
  async (ownedBrowser) => {
    browser = ownedBrowser;
    fixture = await applicationNativeFixture(browser, {
      popup: true,
      onApplicationClose: (outcome) => outcomes.push(outcome),
    });
    return fixture;
  },
  async (request) => {
    const native = nativeApplicationForm(browser, 'https://hh.ru/vacancy/123');
    if (request.method === 'POST' && request.url === '/disabled-apply') {
      await native
        .locator('[data-qa="vacancy-response-link-top"]')
        .evaluate((button) => {
          button.disabled = true;
        });
    }
    if (request.method === 'POST' && request.url === '/enable-apply') {
      await native
        .locator('[data-qa="vacancy-response-link-top"]')
        .evaluate((button) => {
          button.disabled = false;
        });
    }
    if (request.method === 'POST' && request.url === '/disabled-send') {
      await native.locator('#experience').fill('Independent owner answer.');
      await native
        .locator('[data-qa="vacancy-response-submit-popup"]')
        .evaluate((button) => {
          button.disabled = true;
        });
    }
    return {
      skips: await fixture.store.get(vacancySkipId('jobs')),
      native: native
        ? await native.evaluate(() => ({
            experience: document.querySelector('#experience')?.value,
            header: document.querySelector('#header')?.value,
            attempts: globalThis.applicationAttempts,
            entries: globalThis.applicationEntries,
          }))
        : null,
      outcomes,
    };
  }
);
