import { makeBrowserCommander } from 'browser-commander';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import { watchFixturePages } from '../../js/tests/helpers/e2e-page-errors.mjs';
import { gate, vacancySnapshotFixture } from './vacancy-fixture.mjs';
import { createVacancySearchReader } from '../../js/src/jobs/read-search.js';
import { createResumeListReader } from '../../js/src/jobs/read-resumes.js';
import { resumeListHtml } from './resume-list-fixture.mjs';

const cardHtml = (id) =>
  `<article data-qa="vacancy-serp__vacancy"><a data-qa="serp-item__title" href="https://hh.ru/vacancy/${id}?from=search">Python engineer ${id}</a><span data-qa="vacancy-serp__vacancy-employer">Fixture employer</span><span data-qa="vacancy-serp__vacancy-compensation">от 250 000 ₽</span><span data-qa="vacancy-serp__vacancy-address">Москва</span>${id === '124' ? '<span data-qa="vacancy-serp__vacancy_responded">Already responded</span>' : ''}<button data-qa="vacancy-response-link-top">Apply</button></article>`;
const searchHtml = (url) => {
  const parsed = new URL(url);
  const page = Number(parsed.searchParams.get('page'));
  const next = new URL(url);
  next.searchParams.set('page', String(page + 1));
  return `<h1>Fixture vacancies</h1>${page === 0 ? cardHtml('123') + cardHtml('124') : cardHtml('125')}<a data-qa="serp-item__title" hidden href="https://evil.test/">Hidden template</a><nav data-qa="pager-block"><a data-qa="pager-page" aria-current="page" href="${url.replaceAll('&', '&amp;')}">${page + 1}</a>${page === 0 ? `<a data-qa="pager-page" href="${next.href.replaceAll('&', '&amp;')}">2</a>` : ''}</nav>`;
};
const descriptionHtml = (mode) => {
  const data = vacancySnapshotFixture();
  const selectors = {
    title: 'vacancy-title',
    company: 'vacancy-company-name',
    salary: 'vacancy-salary',
    location: 'vacancy-view-raw-address',
    experience: 'vacancy-experience',
    employment: 'vacancy-view-employment-mode',
    workFormat: 'vacancy-view-work-format',
    published: 'vacancy-view-creation-time',
  };
  return `${
    Object.entries(selectors)
      .map(([key, qa]) => `<p data-qa="${qa}">${data[key]}</p>`)
      .join('') +
    (mode === 'incomplete'
      ? ''
      : `<div data-qa="vacancy-description">${data.description.replaceAll('\n', '<br>')}</div>`)
  }<span data-qa="skills-element">Python</span><span data-qa="skills-element">SQL</span><button data-qa="vacancy-response-link-top">Apply</button>`;
};

/** Real DOM and commander navigation; provider traffic stays inside owned routes. */
export const vacancyBrowserFixture = async (
  browser,
  { exports, store = createMemoryStore() } = {}
) => {
  const records = [];
  const errors = [];
  let mode = 'ready';
  let launchGate;
  let app;
  let searchSignal;
  const openSession = async (options) => {
    const record = { options, navigation: [], closed: false, clicks: null };
    records.push(record);
    if (launchGate) {
      await launchGate.promise;
    }
    const context = await browser.newContext();
    await exports?.prepare?.(context);
    const page = await context.newPage();
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const exported = await exports?.route(route, mode);
      if (exported) {
        return;
      }
      if (url.origin !== 'https://hh.ru') {
        return route.abort('blockedbyclient');
      }
      const html =
        mode === 'challenge'
          ? '<input name="captcha" aria-label="Challenge">'
          : url.pathname === '/search/vacancy'
            ? searchHtml(url.href)
            : url.pathname === '/applicant/resumes'
              ? resumeListHtml(mode)
              : descriptionHtml(mode);
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><body>${html}<script>globalThis.fixtureClicks=0;document.addEventListener('click',()=>globalThis.fixtureClicks++);</script></body></html>`,
      });
    });
    const commander = makeBrowserCommander({
      page,
      enableNetworkTracking: false,
      enableNavigationManager: false,
      enableDialogManager: false,
    });
    const goto = commander.goto.bind(commander);
    commander.goto = (input) => {
      record.navigation.push(input.url);
      return goto(input);
    };
    return {
      page,
      commander,
      async close() {
        record.clicks = await page
          .evaluate(() => globalThis.fixtureClicks ?? 0)
          .catch(() => 0);
        await commander.destroy();
        await context.close();
        record.closed = true;
      },
    };
  };
  const readSearch = createVacancySearchReader({ store, openSession });
  const readResumes = createResumeListReader({ store, openSession });
  const server = await startServer({
    localUi: true,
    port: 0,
    tls: false,
    store,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    log: null,
    automations: { scheduler: false },
    vacancies: {
      openSession,
      availability: async () => ({ available: true }),
      readSearch: (url, options) => {
        searchSignal = options.signal;
        return readSearch(url, options);
      },
      readResumes: (options) => {
        searchSignal = options.signal;
        return readResumes(options);
      },
      ...exports?.service({ store, openSession }),
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const context = await browser.newContext({
      viewport: { width: 1180, height: 950 },
    });
    app = await context.newPage();
    watchFixturePages(context, browser, base, errors);
    await app.addInitScript(
      ({ key, version }) => {
        globalThis.localStorage.setItem(
          key,
          JSON.stringify({ off: true, v: version })
        );
        globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      },
      { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
    );
    return {
      base,
      page: app,
      records,
      errors,
      store,
      mode: (value) => {
        mode = value;
      },
      holdLaunch: () => {
        launchGate = gate();
        return () => {
          launchGate.resolve();
          launchGate = null;
        };
      },
      cancellation: () =>
        new Promise((resolve) => {
          if (searchSignal.aborted) {
            resolve();
          } else {
            searchSignal.addEventListener('abort', resolve, { once: true });
          }
        }),
      close: async () => {
        launchGate?.resolve();
        await server.close();
        await context.close();
      },
    };
  } catch (error) {
    await server.close();
    await app?.context().close();
    throw error;
  }
};
