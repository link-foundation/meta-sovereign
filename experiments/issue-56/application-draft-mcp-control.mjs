/** Isolated synthetic owner edits; this fixture endpoint is never a product route. */
export const applicationDraftControl = (browser) => {
  let ownerActions = 0;
  return async (req) => {
    if (
      ![
        '/draft-owner-fill',
        '/draft-owner-open-letter',
        '/draft-values',
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
          'https://hh.ru/applicant/vacancy_response?vacancyId=123'
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
      }),
      ownerActions
    );
  };
};
