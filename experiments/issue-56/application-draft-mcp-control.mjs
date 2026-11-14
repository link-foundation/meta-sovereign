/** Isolated synthetic owner edits; this fixture endpoint is never a product route. */
export const applicationDraftControl = (browser, popup = false) => {
  let ownerActions = 0;
  return async (req) => {
    if (
      ![
        '/draft-owner-fill',
        '/draft-owner-open-letter',
        '/draft-values',
        '/draft-owner-question-ru',
        '/draft-owner-question-usd',
        '/draft-owner-resume-old',
      ].includes(req.url)
    ) {
      return null;
    }
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find(
        (page) =>
          page.url() ===
          (popup
            ? 'https://hh.ru/vacancy/123'
            : 'https://hh.ru/applicant/vacancy_response?vacancyId=123')
      );
    if (!page) {
      throw new Error('No bound synthetic application page');
    }
    if (req.method === 'POST') {
      if (await page.locator('[data-qa="add-cover-letter"]').count()) {
        await page.locator('[data-qa="add-cover-letter"]').click();
      }
      if (req.url === '/draft-owner-fill') {
        await page
          .locator('#experience')
          .fill('Owner-only questionnaire answer.');
        await page
          .locator('[data-qa="vacancy-response-form-letter-input"]')
          .fill('Actual edited owner letter.');
      } else if (
        ['/draft-owner-question-ru', '/draft-owner-question-usd'].includes(
          req.url
        )
      ) {
        await page.locator('#experience').evaluate(
          (node, label) => {
            node.parentElement.firstChild.textContent = label;
          },
          req.url.endsWith('-ru')
            ? 'Расскажите о вашем последнем опыте работы'
            : 'What compensation do you expect in USD?'
        );
      } else if (req.url === '/draft-owner-resume-old') {
        await page.locator('[data-qa="resume-title"]').first().click();
        await page
          .locator(
            '[role="option"][data-qa="magritte-select-option-russian-old"]'
          )
          .click();
      }
      ownerActions++;
    }
    return page.evaluate(
      (ownerActions) => ({
        ownerActions,
        experience: document.querySelector('#experience')?.value ?? null,
        letter:
          document.querySelector(
            '[data-qa="vacancy-response-form-letter-input"]'
          )?.value ?? null,
        header: document.querySelector('#header').value,
        entries: globalThis.applicationEntries,
        submissions: globalThis.applicationAttempts,
        resume:
          document.querySelector('input[name="native-resume"]:checked')
            ?.value ?? null,
        resumeChoices: globalThis.resumeChoices ?? 0,
        resumeMenus: globalThis.resumeMenus ?? 0,
      }),
      ownerActions
    );
  };
};
