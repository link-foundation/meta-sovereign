import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';

/** Native login controls with every provider request fulfilled by an owned fixture. */
export const jobLoginBrowserFixture = async (browser) => {
  const pages = [];
  return {
    ...(await vacancyBrowserFixture(browser, {
      exports: {
        prepare: async (context) => {
          context.on('page', (page) => pages.push(page));
        },
        route: async (route) => {
          if (new URL(route.request().url()).pathname !== '/account/login') {
            return false;
          }
          await route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><html lang="en"><body><h1>Synthetic manual HH login</h1><label>Account<input name="account"></label><label>Password<input name="password" type="password"></label><label>Human verification<input name="captchaText"></label><p>Only the fixture operator types here. No provider traffic or submissions.</p><script>globalThis.fixtureClicks=0;document.addEventListener("click",()=>globalThis.fixtureClicks++);</script></body></html>',
          });
          return true;
        },
        service: () => ({}),
      },
    })),
    providerPages: pages,
  };
};
