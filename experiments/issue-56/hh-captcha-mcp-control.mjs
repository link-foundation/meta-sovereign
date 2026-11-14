import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import { readFormDocument } from '../../js/src/forms/read-document.js';
import {
  changeHhCaptchaFixture,
  hhCaptchaCounters,
} from './hh-captcha-dom.mjs';

export const hhCaptchaControl = (browser) => async (req) => {
  if (
    ![
      '/captcha-qa',
      '/captcha-name',
      '/captcha-hidden',
      '/captcha-clear',
      '/captcha-report',
      '/captcha-stats',
    ].includes(req.url)
  ) {
    return null;
  }
  const page = nativeApplicationForm(browser);
  if (!page) {
    throw new Error('No owned synthetic HH form.');
  }
  if (req.method === 'POST') {
    await page.evaluate(changeHhCaptchaFixture, {
      marker: req.url === '/captcha-name' ? 'name' : 'qa',
      hidden: req.url === '/captcha-hidden',
      clear: req.url === '/captcha-clear',
    });
  }
  return req.url === '/captcha-report'
    ? page.evaluate(readFormDocument)
    : page.evaluate(hhCaptchaCounters);
};
