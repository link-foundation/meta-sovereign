import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import {
  changeApplicationFeedbackFixture,
  readApplicationFeedbackFixture,
} from './application-feedback-dom.mjs';

/** Local fixture-only endpoints, never enabled in the product server. */
export const applicationFeedbackControl = (browser) => async (req) => {
  if (!req.url.startsWith('/feedback-')) {
    return null;
  }
  const page = nativeApplicationForm(browser, 'https://hh.ru/vacancy/123');
  if (!page) {
    throw new Error('No owned synthetic vacancy');
  }
  if (req.method === 'POST') {
    await page.evaluate(
      changeApplicationFeedbackFixture,
      req.url.slice('/feedback-'.length)
    );
  }
  return page.evaluate(readApplicationFeedbackFixture);
};
