import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';

export const vacancyDescriptionHtml =
  'Build Python services.<br>Final employer paragraph.';

export const vacancyMetadataHtml = (mode = 'gross') => {
  const gross = mode !== 'net';
  const salary = gross
    ? 'от 320 000 ₽ до вычета налогов'
    : 'от 280 000 ₽ на руки';
  return `<!doctype html><meta charset="utf-8"><h1 data-qa="vacancy-title">Python engineer</h1>
    <p data-qa="vacancy-company-name">Fixture employer</p>
    <p data-qa="vacancy-salary-compensation-type-${gross ? 'gross' : 'net'}">${salary}</p>
    <p hidden data-qa="vacancy-salary">Hidden template salary</p>
    ${mode === 'conflict' ? '<p data-qa="vacancy-salary">Conflicting salary</p>' : ''}
    ${mode === 'duplicate' ? `<p data-qa="vacancy-salary">${salary}</p>` : ''}
    <p data-qa="vacancy-view-location">Remote location</p>
    <p data-qa="vacancy-experience">3–6 years</p>
    <p data-qa="vacancy-view-employment-mode">Full time</p>
    <p data-qa="vacancy-view-work-format">Remote</p>
    <p data-qa="vacancy-additional-work-format">Hybrid by agreement</p>
    <p data-qa="vacancy-creation-time">16 November 2026</p>
    <div data-qa="vacancy-description" ${mode === 'delayed' ? 'hidden' : ''}>${mode === 'oversized-html' ? `<!--${'x'.repeat(120000)}-->` : ''}${vacancyDescriptionHtml}</div>
    ${mode === 'ambiguous-html' ? '<div data-qa="vacancy-description">Another description</div>' : ''}
    <span data-qa="skills-element"><span data-qa="bloko-tag__text">Python</span></span>
    <span data-qa="bloko-tag__text">SQL</span>
    <span hidden data-qa="bloko-tag__text">Hidden template skill</span>
    <button data-qa="vacancy-response-link-top">Apply</button>
    <script>globalThis.fixtureClicks=0;document.addEventListener('click',()=>globalThis.fixtureClicks++);</script>`;
};

/** All provider HTML is synthetic; the shared server/reader/cache remain real. */
export const vacancyMetadataFixture = async (
  browser,
  { delayed = false } = {}
) => {
  let mode = delayed ? 'delayed' : 'gross';
  const delayedReads = [];
  const fixture = await vacancyBrowserFixture(browser, {
    exports: {
      route: async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== 'https://hh.ru' || url.pathname !== '/vacancy/123') {
          return false;
        }
        await route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: vacancyMetadataHtml(mode),
        });
        return true;
      },
      service: ({ openSession }) => ({
        openSession: async (options) => {
          const session = await openSession(options);
          const evaluate = session.commander.evaluate.bind(session.commander);
          let reads = 0;
          session.commander.evaluate = async (input) => {
            const value = await evaluate(input);
            if (
              mode === 'delayed' &&
              input.fn.name === 'readAssignmentVacancyDocument'
            ) {
              reads++;
              delayedReads.push({
                read: reads,
                description: value.description,
              });
              if (reads === 1) {
                // Hydration begins after the first real DOM read, independently
                // of navigation stabilisation on different hosted browsers.
                await session.page.evaluate(() => {
                  globalThis.setTimeout(() => {
                    globalThis.document.querySelector(
                      '[data-qa="vacancy-description"]'
                    ).hidden = false;
                  }, 300);
                });
              }
            }
            return value;
          };
          return session;
        },
      }),
    },
  });
  return {
    ...fixture,
    metadataMode: (value) => {
      mode = value;
    },
    delayedReads: () => globalThis.structuredClone(delayedReads),
  };
};
