// One bounded automation-chat run with the existing opt-in geometry tracing.
import { webkit } from 'playwright';
const launch = webkit.launch.bind(webkit);
webkit.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const context = await newContext(...options);
    await context.addInitScript(() => {
      globalThis.metaSovereignDebug = true;
    });
    context.on('page', (page) => {
      page.on('console', (message) => {
        if (message.text().startsWith('[ms-debug]')) {
          console.log(message.text());
        }
      });
      page.on('request', (request) => {
        if (request.url().endsWith('/api/client-log')) {
          console.log('[layout-client]', request.postData());
        }
      });
    });
    return context;
  };
  return browser;
};
