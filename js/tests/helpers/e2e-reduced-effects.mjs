// Preload for the e2e scripts (R-Z21): with E2E_REDUCED_EFFECTS=1 every
// browser context the script opens starts with the "Reduce visual
// effects" setting on, before the first navigation, so a slow renderer
// (software-rendered WebKit on Linux) is not asked for blur or the
// page-sized dim. Used as
//
//   E2E_REDUCED_EFFECTS=1 NODE_OPTIONS="--import ./js/tests/helpers/e2e-reduced-effects.mjs" npm run test:e2e:email:webkit
//
// No assertion changes: the scripts run unmodified. Without the variable
// this file does nothing.

const SETTING = 'metaSovereignEffects';

if (process.env.E2E_REDUCED_EFFECTS === '1') {
  const playwright = await import('playwright').catch(() => null);
  const init = () => {
    try {
      globalThis.localStorage.setItem('metaSovereignEffects', 'on');
    } catch {
      // Storage unavailable: the page stays on its automatic choice.
    }
  };
  const types = playwright
    ? [playwright.chromium, playwright.webkit, playwright.firefox]
    : [];
  for (const type of types) {
    const launch = type.launch.bind(type);
    type.launch = async (...args) => {
      const browser = await launch(...args);
      const newContext = browser.newContext.bind(browser);
      const newPage = browser.newPage.bind(browser);
      browser.newContext = async (...a) => {
        const context = await newContext(...a);
        await context.addInitScript(init);
        return context;
      };
      browser.newPage = async (...a) => {
        const page = await newPage(...a);
        await page.context().addInitScript(init);
        return page;
      };
      return browser;
    };
  }
  console.log(`[e2e] reduced visual effects forced (${SETTING}=on)`);
}
