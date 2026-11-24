import { applicationRecruiterPanelFixture } from './application-recruiter-panel-fixture.mjs';
import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { originalApplicationSearch } from './application-search-route-fixture.mjs';

let current;
let fixture;
await serveNativeMcpFixture(
  async (browser) => {
    current = browser;
    fixture = await applicationRecruiterPanelFixture(browser);
    return fixture;
  },
  async (request) => {
    const searchPage = current
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => page.url() === originalApplicationSearch);
    const panel = searchPage?.locator('[data-qa="chatik-root"]');
    const panelOpen = Boolean(await panel?.isVisible());
    const draft = panelOpen
      ? await panel
          .locator('iframe')
          .contentFrame()
          .getByRole('textbox', { name: 'Your reply' })
          .inputValue({ timeout: 5000 })
      : undefined;
    if (request.method === 'POST' && request.url === '/dismiss' && panelOpen) {
      await panel
        .getByRole('button', { name: 'Close recruiter panel' })
        .click({ timeout: 5000 });
    }
    return {
      panelOpen,
      draft,
      searchVisits: fixture.searchVisits,
      outcomes: fixture.effects,
    };
  }
);
