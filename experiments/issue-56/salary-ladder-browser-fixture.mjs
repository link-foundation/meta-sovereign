import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { ladderSearch } from './salary-ladder-fixture.mjs';

/** Real native search extraction with all provider traffic owned by this fixture. */
export const salaryLadderBrowserFixture = (browser) =>
  vacancyBrowserFixture(browser, {
    exports: {
      service: () => ({}),
      route: async (route) => {
        const url = new URL(route.request().url());
        if (
          url.origin !== 'https://hh.ru' ||
          url.pathname !== '/search/vacancy'
        ) {
          return false;
        }
        const result = ladderSearch(url.href);
        const cards = result.cards
          .map(
            (card) =>
              `<article data-qa="vacancy-serp__vacancy"><a data-qa="serp-item__title" href="${card.url}">${card.title}</a><span data-qa="vacancy-serp__vacancy-employer">Fixture employer</span><span data-qa="vacancy-serp__vacancy-compensation">${card.salary}</span>${card.responded ? '<span data-qa="vacancy-serp__vacancy_responded">Already responded</span>' : ''}</article>`
          )
          .join('');
        const next =
          result.nextPage === null
            ? ''
            : `<a data-qa="pager-next" href="${new URL(url.href).origin}${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), page: String(result.nextPage) })}">Next</a>`;
        await route.fulfill({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><html><body>${cards || '<div data-qa="vacancy-serp__no-results">No vacancies</div>'}${next}<script>globalThis.fixtureClicks=0;document.addEventListener('click',()=>globalThis.fixtureClicks++);</script></body></html>`,
        });
        return true;
      },
    },
  });
