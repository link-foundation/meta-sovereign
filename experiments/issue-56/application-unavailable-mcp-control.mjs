import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import { changeUnavailableWarning } from './application-unavailable-dom.mjs';
import { applicationInput } from './application-fixture.mjs';

/** Only the isolated fixture can change this synthetic provider warning. */
export const applicationUnavailableControl = (browser) => async (request) => {
  const kind = {
    '/unavailable-show': 'russian',
    '/unavailable-clear': 'clear',
    '/unavailable-hidden': 'collapsed',
  }[request.url];
  if (!kind || request.method !== 'POST') {
    return null;
  }
  const page = nativeApplicationForm(browser, applicationInput.url);
  if (!page) {
    throw new Error('No bound synthetic vacancy page');
  }
  await page.evaluate(changeUnavailableWarning, kind);
  return { rendered: kind };
};
