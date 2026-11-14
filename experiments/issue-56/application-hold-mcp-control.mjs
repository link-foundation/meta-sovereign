import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import { changeApplicationHoldFixture } from './application-hold-dom.mjs';

/** Isolated owned browser fixture controls, never product HTTP routes. */
export const applicationHoldControl = (browser) => async (req) => {
  const kind = {
    '/hold-show': 'verification',
    '/hold-dismiss': 'clear',
    '/hold-provider-error': 'validation-error',
  }[req.url];
  if (!kind && req.url !== '/hold-values') {
    return null;
  }
  const page = nativeApplicationForm(browser);
  if (!page) {
    throw new Error('No owned synthetic application form');
  }
  if (kind && req.method === 'POST') {
    await page.evaluate(changeApplicationHoldFixture, kind);
  }
  return page.evaluate(() => ({
    experience: document.querySelector('#experience')?.value ?? null,
    header: document.querySelector('#header').value,
    submissions: globalThis.applicationAttempts,
    entries: globalThis.applicationEntries,
  }));
};
