/* global document, window */
import { browserFrameVisible } from './browser-choice-document.js';
import { browserChatScrollRoot } from './browser-chat-list-state.js';
import {
  chatFilterControl,
  activateChatFilter,
} from './browser-chat-filter.js';
import { writeBrowserNativeInput } from './browser-native-input.js';
import {
  browserChatReplyNode,
  browserChatReplyVisible,
} from './browser-chat-reply-view.js';

const viewElements = (ui) => {
  const first = (selector) =>
    [...document.querySelectorAll(selector)].find(browserFrameVisible);
  const fields = [...document.querySelectorAll(ui.composer)].filter(
    browserFrameVisible
  );
  const control = chatFilterControl(ui.chatScan.unreadFilter);
  return {
    field: fields.length === 1 ? fields[0] : null,
    fields: fields.length,
    control,
    list: first(ui.chats.item)
      ? browserChatScrollRoot(first(ui.chats.item))
      : null,
    messages: first(ui.messages.item)
      ? browserChatScrollRoot(first(ui.messages.item))
      : null,
  };
};

const captureView = (ui, token) => {
  const nodes = viewElements(ui);
  const field = nodes.field;
  if (
    nodes.fields > 1 ||
    !nodes.control ||
    (field?.value.length ?? 0) > 100000
  ) {
    return null;
  }
  return {
    token,
    url: window.location.href,
    unreadOnly: nodes.control.checked,
    listTop: nodes.list?.scrollTop ?? null,
    messageTop: nodes.messages?.scrollTop ?? null,
    draft: field
      ? {
          value: field.value,
          start: field.selectionStart,
          end: field.selectionEnd,
          direction: field.selectionDirection,
          top: field.scrollTop,
        }
      : null,
  };
};

const selectionRestored = (draft, field) =>
  !draft ||
  Boolean(
    field &&
    field.selectionStart === draft.start &&
    field.selectionEnd === draft.end &&
    field.selectionDirection === draft.direction &&
    field.scrollTop === draft.top
  );

const restoredView = (state, nodes, ui) => ({
  filter: nodes.control?.checked === state.unreadOnly,
  list: state.listTop === null || nodes.list?.scrollTop === state.listTop,
  messages: state.reply
    ? browserChatReplyVisible(
        browserChatReplyNode(ui, state.reply),
        nodes.messages
      )
    : state.messageTop === null ||
      nodes.messages?.scrollTop === state.messageTop,
  draft: !state.draft || nodes.field?.value === state.draft.value,
  selection: selectionRestored(state.draft, nodes.field),
});

const draftMayRestore = (draft, field) =>
  !draft || (field && (field.value === '' || field.value === draft.value));

const restoreDraft = (draft, field, inactive) => {
  if (!draft) {
    return true;
  }
  if (
    field.value !== draft.value &&
    (field.disabled ||
      field.readOnly ||
      !writeBrowserNativeInput(field, draft.value, inactive))
  ) {
    return false;
  }
  field.setSelectionRange(draft.start, draft.end, draft.direction);
  field.scrollTop = draft.top;
  return true;
};

const restoreView = (state, nodes, inactive, input) => {
  if (!draftMayRestore(state.draft, nodes.field)) {
    return 'draft-changed';
  }
  if (input.operation === 'restore-filter') {
    if (!nodes.control || nodes.control.disabled) {
      return 'filter-unavailable';
    }
    activateChatFilter(
      { control: nodes.control, inactiveToken: input.inactiveToken },
      state.unreadOnly
    );
  } else if (input.operation === 'restore-position') {
    if (!restoreDraft(state.draft, nodes.field, inactive)) {
      return 'draft-unavailable';
    }
    if (nodes.list) {
      nodes.list.scrollTop = state.listTop;
    }
    if (nodes.messages && state.messageTop !== null) {
      nodes.messages.scrollTop = state.messageTop;
    }
  }
  return 'ready';
};

const visitView = (input) => {
  const { ui, operation } = input;
  const root = viewElements(ui).list;
  const candidates = [...document.querySelectorAll(ui.chats.item)].filter(
    (node) =>
      root?.contains(node) &&
      browserFrameVisible(node) &&
      new RegExp(ui.chats.idPattern).exec(
        node.getAttribute(ui.chats.idAttribute) ?? ''
      )?.[1] === input.chat
  );
  if (operation === 'locate') {
    return { state: 'ready', found: candidates.length === 1 };
  }
  if (candidates.length !== 1) {
    return { state: 'chat-unavailable' };
  }
  candidates[0].click();
  return { state: 'activated' };
};

const inactiveReady = (inactive, token) =>
  inactive?.token === token && !inactive.interrupted && !document.hasFocus();

const viewState = (input) => {
  const key = Symbol.for('meta-sovereign.browser-chat-view.v1');
  const { operation, token, inactiveToken, ui } = input;
  if (operation === 'release') {
    if (window[key]?.token === token) {
      delete window[key];
    }
    return { state: 'released' };
  }
  const inactive =
    window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
  if (!inactiveReady(inactive, inactiveToken)) {
    return { state: 'owner-active' };
  }
  if (operation === 'open' && !window[key]) {
    window[key] = captureView(ui, token);
  }
  const state = window[key];
  if (!state || state.token !== token) {
    return { state: state ? 'busy' : 'unavailable' };
  }
  if (operation === 'visit' || operation === 'locate') {
    return visitView(input);
  }
  if (!operation.startsWith('restore') && operation !== 'receipt') {
    return { state: 'ready' };
  }
  if (window.location.href !== state.url) {
    return { state: 'route-changed' };
  }
  const nodes = viewElements(ui);
  const status = restoreView(state, nodes, inactive, input);
  return { state: status, fields: restoredView(state, nodes, ui) };
};

// Static functions only; provider selectors, draft values and URLs remain data.
export const browserChatViewState = new Function(`return (input) => {
  const browserFrameVisible = (${browserFrameVisible.toString()});
  const browserChatScrollRoot = (${browserChatScrollRoot.toString()});
  const browserChatReplyNode = (${browserChatReplyNode.toString()});
  const browserChatReplyVisible = (${browserChatReplyVisible.toString()});
  const chatFilterControl = (${chatFilterControl.toString()});
  const activateChatFilter = (${activateChatFilter.toString()});
  const writeBrowserNativeInput = (${writeBrowserNativeInput.toString()});
  const viewElements = (${viewElements.toString()});
  const captureView = (${captureView.toString()});
  const selectionRestored = (${selectionRestored.toString()});
  const restoredView = (${restoredView.toString()});
  const draftMayRestore = (${draftMayRestore.toString()});
  const restoreDraft = (${restoreDraft.toString()});
  const restoreView = (${restoreView.toString()});
  const visitView = (${visitView.toString()});
  const inactiveReady = (${inactiveReady.toString()});
  return (${viewState.toString()})(input);
}`)();
