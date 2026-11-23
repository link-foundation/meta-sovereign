import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';

const loginPage = `<!doctype html><html lang="en"><body>
  <h1>Synthetic manual HH login</h1>
  <form><label>Account<input name="account"></label>
  <label>Password<input name="password" type="password"></label>
  <label>Human verification<input name="captchaText"></label></form>
  <p>Only the fixture operator types here. No provider traffic or submissions.</p>
  <script>
    globalThis.fixtureClicks = 0;
    globalThis.loginAccess = { reads: 0, writes: 0, submits: 0 };
    const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    for (const input of document.querySelectorAll('input')) {
      Object.defineProperty(input, 'value', {
        get() { loginAccess.reads++; return value.get.call(this); },
        set(text) { loginAccess.writes++; value.set.call(this, text); }
      });
    }
    document.addEventListener('click', () => globalThis.fixtureClicks++);
    document.addEventListener('submit', (event) => {
      event.preventDefault();
      loginAccess.submits++;
    });
  </script>
</body></html>`;

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
            body: loginPage,
          });
          return true;
        },
        service: () => ({}),
      },
    })),
    providerPages: pages,
  };
};
