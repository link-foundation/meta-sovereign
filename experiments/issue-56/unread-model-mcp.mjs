import { prepareQuestionBrowserMcp } from './question-controls-mcp-setup.mjs';
import { enAnswerModel } from '../../js/src/web/locales/en-answer-model.js';
import { ruAnswerModel } from '../../js/src/web/locales/ru-answer-model.js';
import { hiAnswerModel } from '../../js/src/web/locales/hi-answer-model.js';
import { zhAnswerModel } from '../../js/src/web/locales/zh-answer-model.js';
import { enUnreadReview } from '../../js/src/web/locales/en-unread-review.js';
import { ruUnreadReview } from '../../js/src/web/locales/ru-unread-review.js';
import { hiUnreadReview } from '../../js/src/web/locales/hi-unread-review.js';
import { zhUnreadReview } from '../../js/src/web/locales/zh-unread-review.js';

const inspect = async (page, screenshots, dictionaries) => {
  const {
    controls,
    errors,
    stats,
    check,
    shot,
    recoverHeldSurfaces,
    localizedUnread,
  } = await prepareQuestionBrowserMcp(page, { screenshots });
  const unread = controls.locator('[data-browser-unread-controls]');
  await unread.locator('[data-browser-unread-answers]').check();
  const model = unread.locator('[data-model-draft-opt-in]');
  check(!(await model.isChecked()), 'Unread model use defaults off');
  await model.check();
  check(
    await unread.locator('[data-browser-unread-start]').isDisabled(),
    'Mark-read confirmation is required'
  );
  await unread.locator('[data-browser-unread-confirm]').check();
  await unread.locator('[data-browser-unread-start]').click();
  await unread.locator('[data-browser-unread-result="completed"]').waitFor();
  await unread.locator('[data-browser-unread-held="8"]').waitFor();
  await unread.locator('[data-browser-unread-answer="prefilled"]').waitFor();
  await shot('questions', unread);
  const counts = await stats();
  check(
    counts.scans === 1 &&
      counts.modelCalls === 1 &&
      counts.prefills === 1 &&
      counts.sends === 0,
    'One generated review draft without delivery'
  );
  await recoverHeldSurfaces('8');
  const locales = [];
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    const localized = await page.context().newPage();
    try {
      const unread = await localizedUnread(localized, language);
      await unread
        .getByRole('button', { name: dictionary.recover, exact: true })
        .click();
      await unread.locator('[data-browser-unread-held="8"]').waitFor();
      await unread.locator('[data-browser-unread-answers]').check();
      const optIn = unread.getByRole('checkbox', {
        name: dictionary['answerModel.optIn'],
        exact: true,
      });
      await optIn.waitFor();
      check(
        !(await optIn.isChecked()),
        `${language} model opt-in defaults off`
      );
      locales.push({ language, translated: true, defaultOff: true });
    } finally {
      await localized.close();
    }
  }
  check(!errors.length, errors.join(', '));
  check(
    (await stats()).modelCalls === 1,
    'Recovery and locales never regenerate'
  );
  return { locales, cases: 4, pageErrors: errors, ...(await stats()) };
};

export const unreadModelMcpCode = () => `async (page) => {
  const prepareQuestionBrowserMcp = (${prepareQuestionBrowserMcp.toString()});
  return (${inspect.toString()})(page, ${JSON.stringify(`${process.cwd()}/docs/screenshots/issue-56-unread-model`)}, ${JSON.stringify({ en: { ...enAnswerModel, recover: enUnreadReview['browserUnread.recover'] }, ru: { ...ruAnswerModel, recover: ruUnreadReview['browserUnread.recover'] }, hi: { ...hiAnswerModel, recover: hiUnreadReview['browserUnread.recover'] }, zh: { ...zhAnswerModel, recover: zhUnreadReview['browserUnread.recover'] } })});
}`;
