/* global document, window, getComputedStyle, crypto */
import {
  browserInactiveView,
  prepareBrowserInactiveView,
} from './browser-inactive-view.js';

const failure = () =>
  Object.assign(
    new Error('The visible provider chat document changed or is ambiguous'),
    {
      code: 'answer-chat-unverified',
      fallback: false,
    }
  );

/** Private per-document identity also detects same-URL reloads. */
export const browserDocumentIdentity = (selector) => {
  const key = Symbol.for('meta-sovereign.browser-choice-document.v1');
  window[key] ??= crypto.randomUUID();
  return { key: window[key], rows: document.querySelectorAll(selector).length };
};

export const browserFrameVisible = (node) => {
  if (!node.isConnected || !node.getClientRects().length) {
    return false;
  }
  for (let parent = node; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (
      parent.hidden ||
      parent.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    ) {
      return false;
    }
  }
  return true;
};

const trusted = (address, origins) => {
  const url = new URL(address);
  return origins.includes(url.origin) && !url.username && !url.password;
};
const inChat = (frame, ui, target) => {
  const url = new URL(frame.url());
  return (
    trusted(url.href, ui.location.origins) &&
    new RegExp(ui.location.pathPattern).exec(url.pathname)?.[1] ===
      String(target)
  );
};

const visibleFrame = async (frame, main, ui) => {
  for (
    let current = frame;
    current && current !== main;
    current = current.parentFrame()
  ) {
    if (!trusted(current.url(), ui.documents.ancestorOrigins)) {
      return false;
    }
    const element = await current.frameElement();
    try {
      if (!(await element.evaluate(browserFrameVisible))) {
        return false;
      }
    } finally {
      await element.dispose();
    }
  }
  return true;
};

const inList = (frame, ui) =>
  trusted(frame.url(), ui.location.origins) &&
  new RegExp(ui.chatScan.pathPattern).test(new URL(frame.url()).pathname);

const listIdentitySelector = (ui) =>
  [ui.chats.item, ui.chatScan.unreadFilter?.fallback]
    .filter(Boolean)
    .join(', ');

const chooseDocument = async (page, ui, target, list = false) => {
  if (!page || !trusted(page.url(), ui.documents.ownerOrigins)) {
    throw failure();
  }
  const main = page.mainFrame();
  const ownerRoute = new RegExp(ui.location.pathPattern).exec(
    new URL(page.url()).pathname
  );
  if (
    list
      ? !new RegExp(ui.chatScan.pathPattern).test(new URL(page.url()).pathname)
      : ownerRoute && ownerRoute[1] !== String(target)
  ) {
    throw failure();
  }
  const frames = page.frames();
  if (frames.length > ui.documents.maxFrames) {
    throw failure();
  }
  const candidates = [];
  const selector = list ? listIdentitySelector(ui) : ui.messages.item;
  for (const frame of frames) {
    const matching = list ? inList(frame, ui) : inChat(frame, ui, target);
    if (matching && (await visibleFrame(frame, main, ui))) {
      const identity = await frame.evaluate(browserDocumentIdentity, selector);
      if (identity.rows) {
        candidates.push({ frame, identity, frameUrl: frame.url() });
      }
    }
  }
  if (candidates.length !== 1) {
    throw failure();
  }
  const owner = await main.evaluate(browserDocumentIdentity, selector);
  return { ...candidates[0], owner: owner.key, url: page.url() };
};

/** Commander has no frame target; use the connected Playwright frame narrowly. */
const resolveBrowserDocument = async (
  commander,
  page,
  ui,
  target,
  list = false
) => {
  if (!ui.documents) {
    return commander;
  }
  let selected;
  try {
    selected = await chooseDocument(page, ui, target, list);
  } catch {
    throw failure();
  }
  const assertCurrent = async () => {
    try {
      const current = await chooseDocument(page, ui, target, list);
      if (
        current.frame !== selected.frame ||
        current.frameUrl !== selected.frameUrl ||
        current.identity.key !== selected.identity.key ||
        current.owner !== selected.owner ||
        current.url !== selected.url
      ) {
        throw failure();
      }
    } catch {
      throw failure();
    }
  };
  const ownerFrame = page.mainFrame();
  return {
    async prepareInactiveView() {
      await assertCurrent();
      await prepareBrowserInactiveView(page);
      await assertCurrent();
    },
    async evaluateOwner({ fn, args = [] }) {
      if (args.length > 1) {
        throw failure();
      }
      if (args[0]?.operation === 'release') {
        return ownerFrame.evaluate(fn, args[0]);
      }
      await assertCurrent();
      const result = await ownerFrame.evaluate(fn, args[0]);
      await assertCurrent();
      return result;
    },
    async evaluate({ fn, args = [] }) {
      if (args.length > 1) {
        throw failure();
      }
      if (args[0]?.operation === 'release') {
        return selected.frame.evaluate(fn, args[0]);
      }
      await assertCurrent();
      const value =
        selected.frame === page.mainFrame()
          ? await commander.evaluate({ fn, args })
          : await selected.frame.evaluate(fn, args[0]);
      await assertCurrent();
      return value;
    },
    async clickButton({ selector, inactiveToken }) {
      await assertCurrent();
      if (inactiveToken) {
        for (const frame of new Set([ownerFrame, selected.frame])) {
          const { state } = await frame.evaluate(browserInactiveView, {
            operation: 'status',
            token: inactiveToken,
          });
          if (state !== 'ready') {
            throw Object.assign(
              new Error('Inactive reply ownership changed.'),
              {
                code: `browser-background-${state}`,
                fallback: false,
                dispatched: false,
              }
            );
          }
        }
      }
      if (selected.frame === page.mainFrame()) {
        await commander.clickButton({
          selector,
          scrollIntoView: !inactiveToken,
          ...(inactiveToken ? { activation: 'dom', scroll: 'none' } : {}),
          waitForNavigation: false,
          waitAfterClick: 0,
          verify: false,
        });
      } else if (inactiveToken) {
        // DOM activation targets the actual provider control without taking
        // window focus. Its page-local frozen-turn guard still runs on click.
        await selected.frame.locator(selector).evaluate((node) => node.click());
      } else {
        await selected.frame.locator(selector).click({ timeout: 5000 });
      }
    },
  };
};

export const resolveBrowserChoiceDocument = (commander, page, ui, target) =>
  resolveBrowserDocument(commander, page, ui, target);

/** List scans use the same visible-frame and document-identity ownership. */
export const resolveBrowserChatListDocument = (commander, page, ui) =>
  resolveBrowserDocument(commander, page, ui, null, true);
