import assert from 'node:assert/strict';
import * as commander from 'browser-commander';
import * as playwright from 'playwright';
import { openBrowserSession } from '../../js/src/cv/browser.js';

/** Inject only the executable and sandbox requirement into the actual launcher. */
export const openJobProbeBrowser = (
  options,
  executablePath,
  launches,
  args = []
) => {
  assert(options.profileDir);
  return openBrowserSession({
    ...options,
    importers: {
      playwright: async () => playwright,
      'browser-commander': async () => ({
        ...commander,
        launchBrowser: async (launch) => {
          const browser = await commander.launchBrowser({
            ...launch,
            executablePath,
            args: [...launch.args, '--no-sandbox', ...args],
          });
          launches.push({
            profileDir: launch.userDataDir,
            headless: launch.headless,
            keepSessionCookies: browser.keepSessionCookies,
          });
          return browser;
        },
      }),
    },
  });
};
