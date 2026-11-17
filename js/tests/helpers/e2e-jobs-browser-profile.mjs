import { verifyJobBrowserCookies } from '../../../experiments/issue-56/jobs-browser-cookie.mjs';

/** Chromium owns disk profiles; WebKit cannot verify the Chromium cookie store. */
export const verifyJobBrowserProfiles = async (browser) => {
  const engine = browser.browserType().name();
  const result =
    engine === 'chromium'
      ? await verifyJobBrowserCookies(
          process.env.E2E_EXECUTABLE_PATH ??
            browser.browserType().executablePath()
        )
      : { unsupportedProfileEngine: engine, launches: 0, liveProvider: false };
  console.log('[jobs-browser-profile]', JSON.stringify(result));
  return result;
};
