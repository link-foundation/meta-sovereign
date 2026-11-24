/* global document, window, getComputedStyle, crypto, location */
import { setTimeout as sleep } from 'node:timers/promises';
import {
  browserInactiveView,
  prepareBrowserInactiveView,
} from './browser-inactive-view.js';
import { bindBrowserHistory } from './browser-history-binding.js';

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

const browserOwnerPanelState = ({ owner, url, selector, iframe }) => {
  if (
    window[Symbol.for('meta-sovereign.browser-choice-document.v1')] !== owner ||
    location.href !== url
  ) {
    return 'changed';
  }
  const panels = [...document.querySelectorAll(selector)].filter(
    browserFrameVisible
  );
  if (!iframe) {
    return panels.length === 0 ? 'closed' : 'open';
  }
  const [panel] = panels;
  if (
    panels.length !== 1 ||
    !panel.contains(iframe) ||
    !browserFrameVisible(iframe)
  ) {
    return 'changed';
  }
  const controls = [
    ...panel.querySelectorAll('button[data-qa], [role="button"][data-qa]'),
  ].filter(
    (node) =>
      /close/iu.test(node.getAttribute('data-qa')) &&
      browserFrameVisible(node) &&
      !node.matches(':disabled,[disabled]') &&
      !node.closest('[aria-disabled="true"],[inert]')
  );
  if (controls.length !== 1) {
    return 'ambiguous';
  }
  const key = Symbol.for('meta-sovereign.browser-panel-dismissals.v1');
  const attempted = (window[key] ??= new WeakSet());
  if (attempted.has(panel)) {
    return 'pending';
  }
  attempted.add(panel);
  controls[0].click();
  return 'pending';
};

const evaluateOwnerPanelState = new Function(
  `return (input) => {
    const browserFrameVisible = (${browserFrameVisible.toString()});
    return (${browserOwnerPanelState.toString()})(input);
  }`
)();

const topFrameElement = (frame, owner) => {
  let current = frame;
  while (current.parentFrame() && current.parentFrame() !== owner) {
    current = current.parentFrame();
  }
  return current.frameElement();
};

const trusted = (address, origins) => {
  const url = new URL(address);
  return origins.includes(url.origin) && !url.username && !url.password;
};
const chatAt = (frame, ui) => {
  const url = new URL(frame.url());
  return trusted(url.href, ui.location.origins)
    ? new RegExp(ui.location.pathPattern).exec(url.pathname)?.[1]
    : undefined;
};

const browserFrameInPanel = (node, selector) => Boolean(node.closest(selector));

const visibleFrame = async (frame, main, ui, panel) => {
  if (panel && frame === main) {
    return false;
  }
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
      if (
        !(await element.evaluate(browserFrameVisible)) ||
        (panel &&
          current.parentFrame() === main &&
          !(await element.evaluate(browserFrameInPanel, panel)))
      ) {
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

const conflictingChat = (ownerChat, chat) =>
  ownerChat && chat !== undefined && ownerChat !== chat;

const candidateAt = async (frame, main, ui, { list, requested, selector }) => {
  const chat = list ? undefined : chatAt(frame, ui);
  const matching = list
    ? inList(frame, ui)
    : chat &&
      (requested === undefined || chat === requested) &&
      (!ui.documents.frameOrigins ||
        trusted(frame.url(), ui.documents.frameOrigins));
  if (
    !matching ||
    !(await visibleFrame(frame, main, ui, !list && ui.documents.ownerPanel))
  ) {
    return null;
  }
  const identity = await frame.evaluate(browserDocumentIdentity, selector);
  return identity.rows
    ? { frame, identity, frameUrl: frame.url(), chat }
    : null;
};

export const chooseBrowserChatDocument = async (
  page,
  ui,
  target,
  list = false
) => {
  if (!page || !trusted(page.url(), ui.documents.ownerOrigins)) {
    throw failure();
  }
  const main = page.mainFrame();
  const ownerChat = chatAt(main, ui);
  const requested = target === undefined ? undefined : String(target);
  if (
    list
      ? !new RegExp(ui.chatScan.pathPattern).test(new URL(page.url()).pathname)
      : conflictingChat(ownerChat, requested)
  ) {
    throw failure();
  }
  const frames = page.frames();
  if (frames.length > ui.documents.maxFrames) {
    throw failure();
  }
  const candidates = [];
  const selector = list
    ? listIdentitySelector(ui)
    : (ui.documents.chatIdentity ?? ui.messages.item);
  for (const frame of frames) {
    const candidate = await candidateAt(frame, main, ui, {
      list,
      requested,
      selector,
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }
  const [selected] = candidates;
  if (
    candidates.length !== 1 ||
    (!list && conflictingChat(ownerChat, selected.chat))
  ) {
    throw failure();
  }
  const owner = await main.evaluate(browserDocumentIdentity, selector);
  return { ...selected, owner: owner.key, url: page.url() };
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
    selected = await chooseBrowserChatDocument(page, ui, target, list);
  } catch {
    throw failure();
  }
  const assertCurrent = async () => {
    try {
      const current = await chooseBrowserChatDocument(page, ui, target, list);
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
    chat: selected.chat,
    async bindHistory(token, onSnapshot) {
      await assertCurrent();
      return bindBrowserHistory(page, selected.frame, token, onSnapshot);
    },
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
    async dismissOwnerPanel({ verify, admit, signal }) {
      const selector = ui.documents.ownerPanel;
      if (!selector || selected.frame === ownerFrame || !(await verify())) {
        return false;
      }
      await assertCurrent();
      const iframe = await topFrameElement(selected.frame, ownerFrame);
      const location = { owner: selected.owner, url: selected.url, selector };
      try {
        admit();
        if (
          (await ownerFrame.evaluate(evaluateOwnerPanelState, {
            ...location,
            iframe,
          })) !== 'pending'
        ) {
          return false;
        }
        for (const deadline = Date.now() + 1500; Date.now() < deadline;) {
          signal.throwIfAborted();
          const status = await ownerFrame.evaluate(
            evaluateOwnerPanelState,
            location
          );
          if (status !== 'open') {
            return status === 'closed';
          }
          await sleep(75, undefined, { signal });
        }
        return false;
      } finally {
        await iframe.dispose();
      }
    },
    async evaluate({ fn, args = [], beforeEvaluate }) {
      if (args.length > 1) {
        throw failure();
      }
      if (['release', 'releaseHistory'].includes(args[0]?.operation)) {
        return selected.frame.evaluate(fn, args[0]);
      }
      await assertCurrent();
      beforeEvaluate?.();
      const value =
        selected.frame === page.mainFrame()
          ? await commander.evaluate({ fn, args })
          : await selected.frame.evaluate(fn, args[0]);
      await assertCurrent();
      return value;
    },
    async clickButton({ selector, inactiveToken, beforeClick }) {
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
      if (beforeClick) {
        try {
          beforeClick();
        } catch (error) {
          throw Object.assign(error, { dispatched: false });
        }
      }
      if (selected.frame === page.mainFrame()) {
        await commander.clickButton({
          selector,
          scrollIntoView: !inactiveToken && !beforeClick,
          ...(inactiveToken || beforeClick
            ? { activation: 'dom', scroll: 'none' }
            : {}),
          waitForNavigation: false,
          waitAfterClick: 0,
          verify: false,
        });
      } else if (inactiveToken || beforeClick) {
        // DOM activation targets the actual provider control without taking
        // window focus. Its page-local frozen-turn guard still runs on click.
        await selected.frame.locator(selector).evaluate((node) => node.click());
      } else {
        await selected.frame.locator(selector).click({ timeout: 5000 });
      }
    },
  };
};

export const resolveBrowserChoiceDocument = (commander, page, ui, target) => {
  if (target === undefined) {
    throw failure();
  }
  return resolveBrowserDocument(commander, page, ui, target);
};

/** Infer the exact chat only when one trusted, visible native pane owns it. */
export const resolveOpenBrowserConversation = async (
  commander,
  page,
  ui,
  target
) => {
  const document = await resolveBrowserDocument(commander, page, ui);
  if (target !== undefined && document.chat !== target) {
    throw failure();
  }
  return document;
};

/** List scans use the same visible-frame and document-identity ownership. */
export const resolveBrowserChatListDocument = (commander, page, ui) =>
  resolveBrowserDocument(commander, page, ui, null, true);
