import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import { changeApplicationHoldFixture } from './application-hold-dom.mjs';
import { applicationLimitMs } from '../../js/src/jobs/application-limit-data.js';

/** Isolated synthetic fixture controls; never application product routes. */
export const applicationLimitControl = (browser, clock) => async (req) => {
  if (
    ![
      '/limit-show',
      '/limit-dismiss',
      '/limit-expire',
      '/limit-values',
    ].includes(req.url)
  ) {
    return null;
  }
  const page = nativeApplicationForm(browser);
  if (!page) {
    throw new Error('No owned synthetic form for daily limit');
  }
  if (req.method === 'POST') {
    if (req.url === '/limit-show' || req.url === '/limit-dismiss') {
      await page.evaluate(
        changeApplicationHoldFixture,
        req.url === '/limit-show' ? 'daily-limit' : 'clear'
      );
    }
    if (req.url === '/limit-expire') {
      clock.value += applicationLimitMs;
    }
  }
  return page.evaluate(() => ({
    experience: document.querySelector('#experience')?.value,
    letter: document.querySelector(
      '[data-qa="vacancy-response-form-letter-input"]'
    )?.value,
    entries: globalThis.applicationEntries,
    sends: globalThis.applicationAttempts,
  }));
};
