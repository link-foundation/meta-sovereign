import { openBrowserSession } from '../cv/browser.js';
import { assignmentFailure, assignmentSourceUrl } from './validation.js';
const navigationReady = (navigation, status) =>
  navigation?.navigated === true &&
  navigation.verified === true &&
  navigation.status === 'ready' &&
  !(status >= 400);
const pageFailure = (error, kind) =>
  error.code?.startsWith('assignment-') || error.code?.startsWith('jobs-')
    ? error
    : assignmentFailure(
        `${kind}-unavailable`,
        'The requested browser page could not be read.'
      );

/** Own the browser, including a launch that completes after cancellation. */
export const readAssignmentPage = async ({
  store,
  openSession = openBrowserSession,
  platform,
  slot,
  kind,
  url,
  read,
  validate,
  signal,
  redirects = false,
  useCase = 'assignments',
  browserOptions = {},
}) => {
  let session;
  let closing;
  let expired = false;
  let responseStatus;
  const response = (value) => {
    if (
      value.request().isNavigationRequest() &&
      value.frame() === session.page.mainFrame()
    ) {
      responseStatus = value.status();
    }
  };
  const close = () =>
    session
      ? (closing ??= Promise.resolve().then(() => session.close()))
      : Promise.resolve();
  const abort = () => {
    close().catch(() => {});
  };
  const check = () => {
    if (expired || signal?.aborted) {
      throw assignmentFailure(
        expired ? `${kind}-timeout` : 'stopped',
        'Assignment page reading did not complete.'
      );
    }
  };
  const timer = globalThis.setTimeout(() => {
    expired = true;
    abort();
  }, 60000);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    check();
    session = await openSession({
      store,
      platform,
      useCase,
      slot,
      ...browserOptions,
    });
    check();
    session.page?.on('response', response);
    const navigation = await session.commander.goto({
      url,
      waitUntil: 'domcontentloaded',
      timeout: 30000,
      signal,
      ...(redirects
        ? {
            verifyFn: ({ page }) => {
              const actualUrl = page.url();
              return {
                actualUrl,
                verified:
                  assignmentSourceUrl(actualUrl) === actualUrl &&
                  responseStatus >= 200 &&
                  responseStatus < 400,
              };
            },
          }
        : {}),
    });
    check();
    if (!navigationReady(navigation, responseStatus)) {
      throw assignmentFailure(
        `${kind}-unavailable`,
        'The requested browser page did not load successfully.'
      );
    }
    const value = await session.commander.evaluate({ fn: read, args: [] });
    check();
    return await validate(value);
  } catch (error) {
    check();
    throw pageFailure(error, kind);
  } finally {
    signal?.removeEventListener('abort', abort);
    globalThis.clearTimeout(timer);
    session?.page?.off('response', response);
    await close();
  }
};
