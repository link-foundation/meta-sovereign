/* global window, document */
import { setTimeout as sleep } from 'node:timers/promises';
import { browserFrameVisible } from './browser-choice-document.js';
import { browserChatScrollRoot } from './browser-chat-list-state.js';
import { revealChoiceReply } from './browser-choice-visibility.js';
import { createBrowserScanControl } from './browser-scan-control.js';
import { releaseBrowserConversation } from './browser-conversation-history.js';

/** A retained receipt still needs one matching outgoing bubble in this view. */
export const browserChatReplyNode = (ui, reply) => {
  const pattern = new RegExp(ui.messages.idPattern);
  const nodes = [...document.querySelectorAll(ui.messages.item)].filter(
    (node) =>
      pattern.exec(node.getAttribute(ui.messages.idAttribute) ?? '')?.[1] ===
      reply.messageId
  );
  const node = nodes.length === 1 ? nodes[0] : null;
  return node &&
    browserFrameVisible(node) &&
    (node.matches(ui.messages.outgoing) ||
      node.querySelector(ui.messages.outgoing)) &&
    node.querySelector(ui.messages.body)?.innerText.trim() === reply.text
    ? node
    : null;
};

export const browserChatReplyVisible = (node, root) => {
  if (!node || !root?.contains(node)) {
    return false;
  }
  const bubble = node.getBoundingClientRect();
  const pane = root.getBoundingClientRect();
  return (
    bubble.width > 0 &&
    bubble.height > 0 &&
    bubble.bottom > Math.max(0, pane.top) &&
    bubble.top < Math.min(window.innerHeight, pane.bottom) &&
    bubble.right > Math.max(0, pane.left) &&
    bubble.left < Math.min(window.innerWidth, pane.right)
  );
};

const replyViewOwned = (state, inactive, token, inactiveToken) =>
  state &&
  state.token === token &&
  state.url === window.location.href &&
  inactive?.token === inactiveToken &&
  !inactive.interrupted &&
  !document.hasFocus();

const emptyReplyComposer = (state, ui) => {
  const fields = [...document.querySelectorAll(ui.composer)].filter(
    browserFrameVisible
  );
  if (
    state.draft?.value !== '' ||
    fields.length !== 1 ||
    fields[0].value !== '' ||
    fields[0].disabled ||
    fields[0].readOnly
  ) {
    return null;
  }
  return fields[0];
};

const replyView = ({ operation, token, inactiveToken, ui, reply }) => {
  const state = window[Symbol.for('meta-sovereign.browser-chat-view.v1')];
  const inactive =
    window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
  if (!replyViewOwned(state, inactive, token, inactiveToken)) {
    return { state: 'owner-active' };
  }
  const composer = emptyReplyComposer(state, ui);
  if (!composer) {
    return { state: 'owner-draft' };
  }
  if (operation === 'prepare') {
    return { state: 'ready' };
  }
  if (operation === 'discard') {
    delete state.reply;
    return { state: 'ready' };
  }
  const node = browserChatReplyNode(ui, reply);
  if (!node) {
    return { state: 'waiting' };
  }
  if (operation === 'reveal') {
    revealChoiceReply(ui, {}, { composer }, { id: reply.messageId });
  }
  if (!browserChatReplyVisible(node, browserChatScrollRoot(node))) {
    return { state: 'waiting' };
  }
  if (operation === 'commit') {
    state.reply = reply;
  }
  return { state: 'revealed' };
};

export const browserChatReplyView = new Function(`return (input) => {
  const browserFrameVisible = (${browserFrameVisible.toString()});
  const browserChatScrollRoot = (${browserChatScrollRoot.toString()});
  const revealChoiceReply = (${revealChoiceReply.toString()});
  const browserChatReplyNode = (${browserChatReplyNode.toString()});
  const browserChatReplyVisible = (${browserChatReplyVisible.toString()});
  const replyViewOwned = (${replyViewOwned.toString()});
  const emptyReplyComposer = (${emptyReplyComposer.toString()});
  return (${replyView.toString()})(input);
}`)();

/** Reuse the bounded virtual-history tail, yielding immediately to the owner. */
export const revealBrowserChatReply = async (
  { document, ui, reply, token, verify, view, waitMs = 50 },
  pause = sleep
) => {
  const initial = await view('prepare', reply);
  if (initial.state !== 'ready') {
    return initial.state;
  }
  const { control } = createBrowserScanControl(document, {
    item: ui.messages.item,
    idAttribute: ui.messages.idAttribute,
    composer: ui.composer,
    scope: 'history',
    inactiveToken: token,
    tailOnly: true,
  });
  let released = false;
  try {
    await verify();
    if ((await control('open')).state !== 'ready') {
      return 'unavailable';
    }
    const interval = Math.max(50, Math.min(200, waitMs));
    for (let remaining = 2000; remaining > 0; remaining -= interval) {
      await pause(interval);
      await verify();
      const status = await control('status');
      if (status.state !== 'ready') {
        return 'owner-active';
      }
      if (status.loading || status.scrollPending) {
        continue;
      }
      const result = await view('reveal', reply);
      if (result.state === 'revealed') {
        await pause(interval);
        await verify();
        const settled = await control('status');
        if (settled.state !== 'ready') {
          return 'owner-active';
        }
        if (
          settled.scrollPending ||
          (await view('commit', reply)).state !== 'revealed'
        ) {
          continue;
        }
        await control('release', { restore: false });
        released = true;
        return 'revealed';
      }
      if (result.state !== 'waiting') {
        return result.state;
      }
    }
    return 'unavailable';
  } finally {
    if (!released) {
      await view('discard', reply).catch(() => {});
      await releaseBrowserConversation(control, pause, waitMs, verify);
    }
  }
};
