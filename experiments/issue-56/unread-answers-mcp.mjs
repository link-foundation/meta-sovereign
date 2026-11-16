import { prepareQuestionBrowserMcp } from './question-controls-mcp-setup.mjs';
import { enUnreadReview } from '../../js/src/web/locales/en-unread-review.js';
import { ruUnreadReview } from '../../js/src/web/locales/ru-unread-review.js';
import { hiUnreadReview } from '../../js/src/web/locales/hi-unread-review.js';
import { zhUnreadReview } from '../../js/src/web/locales/zh-unread-review.js';

const inspect = async (page, screenshots) => {
  const { controls, errors, stats, check, shot, unreadSurface } =
    await prepareQuestionBrowserMcp(page, { screenshots });
  const unread = controls.locator('[data-browser-unread-controls]');
  await unread.locator('[data-browser-unread-answers]').check();
  check(
    await unread.locator('[data-browser-unread-start]').isDisabled(),
    'Mark-read confirmation is required'
  );
  check((await stats()).scans === 0, 'No traversal before confirmation');
  await unread.locator('[data-browser-unread-confirm]').check();
  await unread.locator('[data-browser-unread-start]').click();
  await unread.locator('[data-browser-unread-result="completed"]').waitFor();
  await unread.locator('[data-browser-unread-held="9"]').waitFor();
  await unread.locator('[data-browser-unread-answer="prefilled"]').waitFor();
  await shot('questions', unread);
  const before = await stats();
  check(
    before.scans === 1 && before.sends === 1 && before.prefills === 1,
    'Exactly one approved bot option and one review draft'
  );
  for (const [surface, hash, width] of [
    ['chat', '#chat=hh:7', 1180],
    ['operator', '#/operator?chat=hh%3A7', 390],
  ]) {
    const shared = await unreadSurface(surface, hash, width);
    await shared
      .getByRole('button', { name: 'Recover unread pass status', exact: true })
      .click();
    await shared.locator('[data-browser-unread-held="9"]').waitFor();
    await shot(surface, shared);
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      'No viewport overflow'
    );
  }
  check(!errors.length, errors.join(', '));
  check((await stats()).scans === 1, 'Shared recovery never replays');
  return {
    cases: [
      'explicit-mode',
      'ordinary-draft-held',
      'chat-recovery',
      'operator-recovery',
    ],
    pageErrors: errors,
    ...(await stats()),
  };
};
export const unreadAnswersMcpCode = () => `async (page) => {
  const prepareQuestionBrowserMcp = (${prepareQuestionBrowserMcp.toString()});
  return (${inspect.toString()})(page, ${JSON.stringify(`${process.cwd()}/docs/screenshots/issue-56-unread-answers`)});
}`;

const inspectLocales = async (page, dictionaries) => {
  const result = [];
  const errors = [];
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    const localized = await page.context().newPage();
    localized.on('pageerror', (error) => errors.push(error.message));
    try {
      await localized.addInitScript((locale) => {
        globalThis.localStorage.setItem('metaSovereignLocale', locale);
        globalThis.localStorage.setItem(
          'metaSovereignTutorial',
          JSON.stringify({ off: true, v: 5 })
        );
      }, language);
      await localized.goto(`${new URL(page.url()).origin}/#/automation`);
      await localized.locator('[data-question-controls] > summary').click();
      const controls = localized.locator(
        '[data-question-controls] [data-browser-answer-controls]'
      );
      await controls.locator(':scope > summary').click();
      const unread = controls.locator('[data-browser-unread-controls]');
      await unread
        .getByRole('checkbox', {
          name: dictionary['browserUnread.answers'],
          exact: true,
        })
        .waitFor();
      await unread
        .getByRole('button', {
          name: dictionary['browserUnread.recover'],
          exact: true,
        })
        .click();
      const held = unread.locator('[data-browser-unread-held="9"]');
      await held.waitFor();
      const expected = dictionary['browserUnread.held'].replace('{chat}', '9');
      if (!(await held.innerText()).includes(expected)) {
        throw new Error(`Untranslated held receipt: ${language}`);
      }
      result.push({ language, translated: true, heldChat: '9' });
    } finally {
      await localized.close();
    }
  }
  if (errors.length) {
    throw new Error(errors.join(', '));
  }
  return { result, pageErrors: errors, liveProvider: false };
};

export const unreadAnswersLocalesMcpCode = () => `async (page) => {
  return (${inspectLocales.toString()})(page, ${JSON.stringify({ en: enUnreadReview, ru: ruUnreadReview, hi: hiUnreadReview, zh: zhUnreadReview })});
}`;
