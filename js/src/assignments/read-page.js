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

const traceNavigation = (phase, details = {}) => {
  if (process.env.FORMS_SOURCE_DEBUG === '1') {
    console.debug('[forms-source]', phase, details);
  }
};

const watchNavigation = (page, downloads, watchDownload) => {
  let navigationResponse;
  let downloadUrl;
  const download = (file) => {
    traceNavigation('download-started');
    downloadUrl ??= file.url();
    const cancellation = file.cancel().catch(() => {});
    downloads.add(cancellation);
    cancellation.then(() => downloads.delete(cancellation));
  };
  const response = (value) => {
    if (
      value.request().isNavigationRequest() &&
      value.frame() === page.mainFrame()
    ) {
      navigationResponse = value;
      traceNavigation('navigation-response', { status: value.status() });
    }
  };
  const verifyRedirect = ({ page: current }) => {
    const actualUrl = current.url();
    const status = navigationResponse?.status();
    return {
      actualUrl,
      verified:
        assignmentSourceUrl(actualUrl) === actualUrl &&
        status >= 200 &&
        status < 400,
    };
  };
  page?.on('response', response);
  if (watchDownload) {
    page?.on('download', download);
  }
  return {
    verifyRedirect,
    get response() {
      return navigationResponse;
    },
    get downloadUrl() {
      return downloadUrl;
    },
    close() {
      page?.off('response', response);
      if (watchDownload) {
        page?.off('download', download);
      }
    },
  };
};

const readNavigationDocument = async (
  navigation,
  observed,
  readResponse,
  { session, signal, check }
) => {
  const downloadReported = /download is starting/i.test(
    navigation?.error?.message ?? navigation?.reason ?? ''
  );
  traceNavigation('navigation-returned', {
    status: navigation?.status,
    downloadReported,
  });
  if (readResponse && downloadReported && !observed.downloadUrl) {
    // WebKit may reject goto before emitting its final response and download.
    await session.page
      .waitForEvent('download', { timeout: 1000 })
      .catch(() => {});
    check();
  }
  return readResponse?.({
    session,
    response: observed.response,
    downloadUrl: downloadReported ? observed.downloadUrl : undefined,
    signal,
    check,
  });
};

const navigateAssignmentPage = async ({
  session,
  url,
  redirects,
  signal,
  check,
  downloads,
  readResponse,
  kind,
}) => {
  const { page, commander } = session;
  const observed = watchNavigation(page, downloads, Boolean(readResponse));
  try {
    const navigation = await commander
      .goto({
        url,
        waitUntil: 'domcontentloaded',
        timeout: 30000,
        signal,
        ...(redirects ? { verifyFn: observed.verifyRedirect } : {}),
      })
      .catch((error) => ({ error }));
    check();
    const document = await readNavigationDocument(
      navigation,
      observed,
      readResponse,
      {
        session,
        signal,
        check,
      }
    );
    if (document) {
      return document;
    }
    if (navigation?.error) {
      throw navigation.error;
    }
    if (!navigationReady(navigation, observed.response?.status())) {
      throw assignmentFailure(
        `${kind}-unavailable`,
        'The requested browser page did not load successfully.'
      );
    }
    return undefined;
  } finally {
    observed.close();
  }
};

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
  execute,
  readResponse,
  deadlineMs = 60000,
}) => {
  let session;
  let closing;
  let expired = false;
  const deadline = new AbortController();
  const launchSignal = globalThis.AbortSignal.any(
    [signal, deadline.signal].filter(Boolean)
  );
  const downloads = new Set();
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
    deadline.abort();
    abort();
  }, deadlineMs);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    check();
    session = await openSession({
      store,
      platform,
      useCase,
      slot,
      ...browserOptions,
      signal: launchSignal,
    });
    check();
    const document = await navigateAssignmentPage({
      session,
      url,
      redirects,
      signal: launchSignal,
      check,
      downloads,
      readResponse,
      kind,
    });
    const value =
      document ??
      (execute
        ? await execute(session, check)
        : await session.commander.evaluate({ fn: read, args: [] }));
    check();
    return await validate(value);
  } catch (error) {
    check();
    throw pageFailure(error, kind);
  } finally {
    signal?.removeEventListener('abort', abort);
    globalThis.clearTimeout(timer);
    try {
      await close();
    } finally {
      await Promise.all(downloads);
    }
  }
};
