import { formFailure as failure, formUrl } from './options.js';

export const CAPTCHA_WAIT_MS = 30 * 60 * 1000;
export const pendingPrefill = (result) =>
  ['waiting-owner', 'prefilling'].includes(result?.state);

export const challengeFrameUrl = (value) => {
  const url = new URL(value);
  return (
    /(^|\.)(captcha\.yandex\.net|hcaptcha\.com|recaptcha\.net)$/u.test(
      url.hostname
    ) ||
    ['smartcaptcha.yandexcloud.net', 'challenges.cloudflare.com'].includes(
      url.hostname
    ) ||
    (/(^|\.)google\.com$/u.test(url.hostname) &&
      url.pathname.startsWith('/recaptcha/'))
  );
};

/** One cancellable delay; no timer or abort listener survives its owner. */
export const challengeDelay = (milliseconds, signal, timers = globalThis) =>
  new Promise((resolve, reject) => {
    const finish = (error) => {
      timers.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const abort = () =>
      finish(failure('form-session-closed', 'Review stopped.'));
    const timer = timers.setTimeout(() => finish(), milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
  });

const destination = (value) => {
  const url = new URL(formUrl(value));
  // Preserve query parameters too: a different vacancy/page is not permission
  // to continue the owner's original request.
  return `${url.origin}${url.pathname}${url.search}`;
};

const traceChallenge = (record, event, detail = {}) =>
  record.browser?.trace?.({ event, ...detail });

const validateWait = (waitMs, pollMs) => {
  if (
    !Number.isInteger(waitMs) ||
    waitMs <= 0 ||
    waitMs > CAPTCHA_WAIT_MS ||
    !Number.isInteger(pollMs) ||
    pollMs <= 0 ||
    pollMs > waitMs
  ) {
    throw failure('form-options', 'Use bounded manual verification limits.');
  }
};

const intendedDestination = (record, report) => {
  const redirected =
    challengeFrameUrl(report.url) ||
    (/^\/(showcaptcha|checkcaptcha)(\/|$)/u.test(
      new URL(report.url).pathname
    ) &&
      /(^|\.)yandex\.(ru|com)$/u.test(new URL(report.url).hostname));
  return destination(redirected ? record.url : report.url);
};

const pollChallenge = async ({
  record,
  report,
  check,
  started,
  waitMs,
  now,
  pollMs,
  timers,
  inspect,
}) => {
  while (report.challenge?.active) {
    check();
    const remaining = started + waitMs - now();
    if (remaining <= 0) {
      throw failure('form-captcha-timeout', 'Manual verification expired.');
    }
    await challengeDelay(
      Math.min(pollMs, remaining),
      record.operationAbort?.signal,
      timers
    );
    check();
    if (now() >= started + waitMs) {
      throw failure('form-captcha-timeout', 'Manual verification expired.');
    }
    report = await inspect(record.browser, { check });
    check();
    if (now() >= started + waitMs) {
      throw failure('form-captcha-timeout', 'Manual verification expired.');
    }
  }
  return report;
};

/** Manual verification is never an answer source or a browser write target. */
export const waitForManualChallenge = async ({
  record,
  result,
  inspect,
  check,
  onWaiting,
  now = () => Date.now(),
  timers = globalThis,
  waitMs = CAPTCHA_WAIT_MS,
  pollMs = 1000,
}) => {
  validateWait(waitMs, pollMs);
  let report = await inspect(record.browser, { check });
  check();
  if (!report.challenge?.active) {
    return;
  }
  const intended = intendedDestination(record, report);
  const started = now();
  result.state = 'waiting-owner';
  result.report = report;
  result.wait = {
    kind: 'captcha',
    startedAt: new Date(started).toISOString(),
    expiresAt: new Date(started + waitMs).toISOString(),
  };
  const resumeDeadline = record.pauseDeadline?.(waitMs);
  try {
    traceChallenge(record, 'captcha-wait-started', result.wait);
    onWaiting?.(result);
    report = await pollChallenge({
      record,
      report,
      check,
      started,
      waitMs,
      now,
      pollMs,
      timers,
      inspect,
    });
    if (destination(report.url) !== intended) {
      throw failure('form-changed', 'Manual verification opened another form.');
    }
    result.state = 'prefilling';
    result.report = report;
    traceChallenge(record, 'captcha-wait-cleared');
    return report;
  } catch (error) {
    traceChallenge(record, 'captcha-wait-stopped', {
      code: error.code ?? 'form-read-unavailable',
    });
    throw error;
  } finally {
    resumeDeadline?.();
  }
};
