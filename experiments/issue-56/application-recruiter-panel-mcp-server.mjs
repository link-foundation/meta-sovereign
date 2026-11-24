import { applicationRecruiterPanelFixture } from './application-recruiter-panel-fixture.mjs';
import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { originalApplicationSearch } from './application-search-route-fixture.mjs';

let current;
let fixture;
await serveNativeMcpFixture(
  async (browser) => {
    current = browser;
    fixture = await applicationRecruiterPanelFixture(browser, {
      panelDelayMs: 4000,
    });
    return fixture;
  },
  async (request) => {
    const searchPage = current
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url() === originalApplicationSearch);
    const panel = searchPage?.locator('[data-qa="chatik-root"]');
    const panelOpen = Boolean(await panel?.isVisible());
    const frame = panel
      ?.locator('iframe[title="Recruiter chat"]')
      .contentFrame();
    const sends = searchPage
      ? await searchPage.evaluate(() =>
          globalThis.sessionStorage.getItem('fixture-application-sends')
        )
      : undefined;
    let draft;
    if (panelOpen) {
      draft = await frame
        .getByRole('textbox', { name: 'Your reply' })
        .inputValue({ timeout: 5000 });
      if (request.method === 'POST') {
        const vacancy = /^\/vacancy\/(123|789)$/u.exec(request.url)?.[1];
        if (vacancy) {
          await frame
            .locator('[data-qa="chatik-header-sub-header"] a')
            .evaluate(
              (node, url) => node.setAttribute('href', url),
              `https://hh.ru/vacancy/${vacancy}`
            );
        } else if (request.url === '/dismiss') {
          await panel
            .getByRole('button', { name: 'Close recruiter panel' })
            .click({ timeout: 5000 });
        }
      }
    }
    return {
      panelOpen,
      draft,
      sends,
      searchVisits: fixture.searchVisits,
      outcomes: fixture.effects,
    };
  }
);
