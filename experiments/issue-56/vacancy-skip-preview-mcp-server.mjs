import { applicationNativeFixture } from './application-native-fixture.mjs';
import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { changeExternalSkipNotice } from './vacancy-skip-dom.mjs';
import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import { applicationInput } from './application-fixture.mjs';
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
    if (request.method === 'POST' && request.url === '/refusal') {
      const owned = nativeApplicationForm(browser, applicationInput.url);
      await owned.evaluate(() => globalThis.openApplication(false));
      await owned.locator('#experience').fill('Owner preview answer');
      await owned.evaluate(changeExternalSkipNotice, 'valid');
    }
    return {
      skips: (await fixture.store.get(vacancySkipId('jobs'))) ?? null,
      outcomes,
    };
  }
);
