// WebKit emits a JS-source diagnostic even for a handled fetch rejection
// or EventSource cancellation (experiments/issue50-eventsource-navigation.mjs)
// during document replacement (microsoft/playwright#43120). Keep this
// exception confined to WebKit and this fixture's exact origin. An actual
// unhandled rejection (e.g. TypeError: Load failed) still fails the test.
import path from 'node:path';

const handledWebKitLoad = (error, engine, base) => {
  // Playwright parses this native console diagnostic at the first colon,
  // putting its prefix and scheme in Error.name. Ordinary application
  // exceptions with identical message text must still fail.
  if (
    engine !== 'webkit' ||
    !/^(?:Fetch API|EventSource) cannot load https?$/.test(error.name)
  ) {
    return false;
  }
  const match =
    /^(?:Fetch API|EventSource) cannot load (.+) due to access control checks\.?$/.exec(
      String(error)
    );
  if (!match) {
    return false;
  }
  try {
    // Native WebKit also prints "http: /host" in this diagnostic (run
    // 40756323406). Accept that exact display form, not arbitrary bad URLs.
    const url = match[1].replace(/^(https?): \//, '$1://');
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
};

/** Apply one policy to initial pages, reopened pages and popups. */
export const watchChatPages = (context, { errors, engine, base, trace }) => {
  const watch = (page) => {
    page.on('pageerror', (error) => {
      const message = String(error);
      if (handledWebKitLoad(error, engine, base)) {
        trace?.('handled WebKit same-origin network diagnostic');
      } else {
        errors.push(message);
      }
    });
    page.on('dialog', (dialog) => {
      errors.push(`browser dialog: ${dialog.message()}`);
      void dialog.dismiss().catch((error) => errors.push(String(error)));
    });
  };
  context.on('page', watch);
  context.pages().forEach(watch);
};

/** Capture the pages that are still open after a close/reopen scenario. */
export const screenshotChatPages = async (
  context,
  { artifactDir, name, engine, report = console.error }
) => {
  const pages = context.pages().filter((page) => !page.isClosed());
  for (const [index, page] of pages.entries()) {
    const suffix = index === 0 ? '' : `-${index}`;
    try {
      await page.screenshot({
        path: path.join(artifactDir, `ms-e2e-${name}-${engine}${suffix}.png`),
      });
    } catch (error) {
      report(`[e2e-${name}] screenshot failed: ${error.message}`);
    }
  }
};
