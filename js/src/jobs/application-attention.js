import { CAPTCHA_WAIT_MS } from '../forms/challenge-wait.js';
import { inspectFormChallenge } from '../forms/inspection.js';
import { readApplicationVerification } from './application-page.js';
import { jobsFailure } from './options.js';
import { bindAttentionPage } from '../automation/attention-foreground.js';
import { applicationRouteView } from './application-route-settings.js';

const live = (record) =>
  record?.active === true &&
  !record.closing &&
  Boolean(record.browser) &&
  !record.browser.page?.isClosed?.();

const viewing = ({ browser: { page, policy } }) =>
  policy?.headless === false && typeof page?.bringToFront === 'function';

export class ApplicationAttention {
  constructor({ now, readVerification = readApplicationVerification }) {
    this.now = now;
    this.readVerification = readVerification;
  }

  observe(record, page, state) {
    const wait = record.attention;
    if (!page.bound || (wait && wait.documentKey !== page.documentKey)) {
      record.attention = null;
    }
    if (!page.bound) {
      return;
    }
    if (!(page.challenge || state === 'verification')) {
      if (state !== undefined) {
        record.attention = null;
      }
      return;
    }
    if (record.attention) {
      record.attention.checkFrames = !page.challenge;
      return;
    }
    const started = this.now();
    record.attention = {
      documentKey: page.documentKey,
      checkFrames: !page.challenge,
      notice: {
        id: globalThis.crypto.randomUUID(),
        browserSlot: record.browserSlot,
        requestId: record.requestId,
        kind: 'hh-application-verification',
        startedAt: new Date(started).toISOString(),
        expiresAt: new Date(started + CAPTCHA_WAIT_MS).toISOString(),
      },
    };
  }

  async read(record, wait) {
    const { browser, url } = record;
    const matches = (page) =>
      page.bound && page.documentKey === wait.documentKey;
    const searchUrl = record.attachmentSearchActive
      ? applicationRouteView(record.options).applicationSearchUrl
      : undefined;
    const before = await this.readVerification(browser, url, searchUrl);
    if (!matches(before) || before.challenge || !wait.checkFrames) {
      return matches(before) && before.challenge;
    }
    return (
      (await inspectFormChallenge(browser)) &&
      matches(await this.readVerification(browser, url, searchUrl))
    );
  }

  async current(record, owned) {
    const wait = record?.attention;
    const active = () =>
      owned() &&
      live(record) &&
      record.attention === wait &&
      Date.parse(wait.notice.expiresAt) > this.now();
    if (!wait || !active()) {
      return null;
    }
    wait.probe ??= this.read(record, wait).finally(() => {
      wait.probe = null;
    });
    let waiting;
    try {
      waiting = await wait.probe;
    } catch {
      return null;
    }
    if (!active()) {
      return null;
    }
    if (!waiting) {
      record.attention = null;
      return null;
    }
    return bindAttentionPage(
      { ...wait.notice, focusAvailable: viewing(record) },
      record.browser.page
    );
  }

  async focus(record, owned, { id, requestId, browserSlot }) {
    const notice = await this.current(record, owned);
    if (
      !notice ||
      !owned() ||
      !live(record) ||
      record.attention?.notice.id !== id ||
      notice.requestId !== requestId ||
      notice.browserSlot !== browserSlot
    ) {
      throw jobsFailure(
        'attention-ended',
        'That HeadHunter verification wait has ended.'
      );
    }
    if (!notice.focusAvailable) {
      throw jobsFailure(
        'attention-focus-unavailable',
        'This browser has no visible window.'
      );
    }
    await record.browser.page.bringToFront();
    return { ok: true };
  }
}
