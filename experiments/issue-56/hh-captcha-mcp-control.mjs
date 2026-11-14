import { nativeApplicationForm } from '../../js/tests/helpers/application-native-request.mjs';
import { readFormDocument } from '../../js/src/forms/read-document.js';
import { readResumeListDocument } from '../../js/src/jobs/read-resumes.js';
import { readVacancySearchDocument } from '../../js/src/jobs/read-search.js';
import { readAssignmentVacancyDocument } from '../../js/src/assignments/vacancy-reader.js';
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
      '/captcha-discovery',
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
  if (req.url === '/captcha-discovery') {
    const results = [];
    for (const reader of [
      readResumeListDocument,
      readVacancySearchDocument,
      readAssignmentVacancyDocument,
    ]) {
      results.push(await page.evaluate(reader));
    }
    return results;
  }
  return req.url === '/captcha-report'
    ? page.evaluate(readFormDocument)
    : page.evaluate(hhCaptchaCounters);
};
