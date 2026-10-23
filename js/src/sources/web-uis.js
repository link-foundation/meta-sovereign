/**
 * The networks' own web apps, as plain data (issue #31, R-Y38).
 *
 * When a network's API cannot do something — no token, a token that may
 * not write to this person, an action the API simply does not have
 * (editing a WhatsApp message, reading LinkedIn messages) — the person
 * can still do it by hand in the web app. `./browser-sender.js` and
 * `./browser-actions.js` do exactly that, in the persistent browser
 * profile where the user signed in once, by following this table.
 *
 * The selectors are BEST-EFFORT: they were chosen from the current public
 * markup of each web app and cannot be verified here without a
 * signed-in account. Every web app ships new markup from time to time,
 * so the table is plain data — pass a patched copy as
 * `createBrowserSender({ platforms })` to override any entry without
 * touching this file. Each selector field may be a comma-separated
 * candidate list; the first candidate that matches wins.
 *
 * Entry fields:
 * - `chatUrl(target, { text })` URL of the conversation;
 * - `listUrl` the page with the chat list (default `loginUrl`);
 * - `target({ chat, to })` which draft field addresses the chat;
 * - `loginUrl` where the user signs in once (persistent profile);
 * - `loggedIn` / `loggedOut` markers telling the two states apart;
 * - `composer` the message input;
 * - `prefill` the chat URL already puts the text into the composer;
 * - `send` `{ selector, key }`: click the button, else press the key;
 * - `messages` how to read the visible history (see `extractMessages`);
 * - `chats` how to read the chat list (see `extractChats`);
 * - `actions` how to edit, delete, react to and forward one message
 *   (see ./browser-actions.js): `menu` opens the message's menu
 *   (`'contextmenu'` — a right click — or a selector of a button inside
 *   the message, shown on hover), then the menu items.
 */

import { chatIdOf, parseChatRef } from './whatsapp-ids.js';

/** VK peer ids of group chats start here (`messages.send` peer_id). */
const VK_CHAT_PEER_OFFSET = 2000000000;

const isNumericId = (value) => /^-?\d+$/.test(String(value));

// Our chat ids carry the network's kind of thread (`room:123`); the
// web app's URL wants the bare id.
const bareId = (target) =>
  String(target)
    .trim()
    .replace(/^[a-z]+:/i, '');

const vk = {
  id: 'vk',
  name: 'VK',
  loginUrl: 'https://vk.com/',
  listUrl: 'https://vk.com/im',
  chatUrl: (target) => {
    const raw = String(target).replace(/^@/, '');
    const sel =
      isNumericId(raw) && Number(raw) >= VK_CHAT_PEER_OFFSET
        ? `c${Number(raw) - VK_CHAT_PEER_OFFSET}`
        : raw;
    return `https://vk.com/im?sel=${encodeURIComponent(sel)}`;
  },
  target: ({ chat, to }) => chat ?? to,
  loggedIn: '#l_msg, .im-page, .ConvoMain, [data-testid="im_page"]',
  loggedOut: '#index_login, .VkIdForm, form[action*="login"]',
  composer:
    '.ComposerInput__input[contenteditable="true"], .im_editable[contenteditable="true"], div[contenteditable="true"][role="textbox"]',
  prefill: false,
  send: {
    selector:
      '.ConvoComposer__sendButton--submit, .im-send-btn_send, button[aria-label="Отправить"], button[aria-label="Send"]',
    key: 'Enter',
  },
  messages: {
    item: '.ConvoHistory__messageBlock, .im-mess[data-msgid]',
    idAttribute: 'data-msgid',
    sender: '.PeerTitle__title, .ConvoMessageAuthor, .im-mess-stack--lnk',
    body: '.MessageText, .im-mess--text',
    time: 'time, .ConvoMessageInfo__time, .im-mess--lnk',
    timeAttribute: 'datetime',
    outgoing: '.ConvoMessage--out, .im-mess_out',
  },
  chats: {
    item: '.ConvoListItem, .nim-dialog[data-list-id]',
    idAttribute: 'data-list-id',
    link: 'a[href*="sel="]',
    linkPattern: 'sel=(c?-?\\d+)',
    title: '.ConvoListItem__title, ._im_dialog_link',
    preview: '.ConvoListItem__message, .nim-dialog--preview',
    unread: '.ConvoListItem__unreadBadge, .nim-dialog--unread',
    time: '.ConvoListItem__date, .nim-dialog--date',
  },
  actions: {
    menu: '.ConvoMessageActions__more, .im-mess--actions .im-mess--more, button[aria-label="Ещё"], button[aria-label="More"]',
    edit: '.ConvoMessageActions__edit, .im-mess--edit, [aria-label="Редактировать"], [aria-label="Edit"]',
    delete:
      '.ConvoMessageActions__delete, .im-mess--delete, [aria-label="Удалить"], [aria-label="Delete"]',
    deleteForAll:
      '.ConvoDeleteMessages__forAll input[type="checkbox"], #del_all_mess',
    deleteConfirm:
      '.ConvoDeleteMessages button.vkuiButton--mode-primary, .box_controls .FlatButton--primary, .popup_box_container .flat_button.button_blue',
    react:
      '.ConvoMessageActions__reaction, .im-mess--reaction, [aria-label="Реакция"], [aria-label="Reaction"]',
    reaction: (emoji) =>
      `[data-reaction="${emoji}"], [aria-label="${emoji}"], img[alt="${emoji}"]`,
    forward:
      '.ConvoMessageActions__forward, .im-mess--forward, [aria-label="Переслать"], [aria-label="Forward"]',
    forwardSearch:
      '.ForwardMessagesModal input[type="search"], .ui_search_field, input[placeholder*="Поиск"], input[placeholder*="Search"]',
    forwardResult:
      '.ForwardMessagesModal .ConvoListItem, .olist_item_wrap, [role="option"]',
  },
};

const telegram = {
  id: 'telegram',
  name: 'Telegram',
  loginUrl: 'https://web.telegram.org/k/',
  // Web K routes `#@username` to a public username and `#<id>` to a
  // numeric peer id (negative for groups and channels).
  chatUrl: (target) => {
    const raw = String(target).trim();
    const peer = isNumericId(raw) ? raw : `@${raw.replace(/^@/, '')}`;
    return `https://web.telegram.org/k/#${peer}`;
  },
  target: ({ chat, to }) => chat ?? to,
  loggedIn: '#column-left .chatlist, .chatlist-container, .chat-input',
  loggedOut: '.page-sign, .page-signQR, .auth-pages',
  composer:
    '.input-message-input[contenteditable="true"], div[contenteditable="true"].input-message-input',
  prefill: false,
  send: { selector: 'button.btn-send', key: 'Enter' },
  messages: {
    item: '.bubble[data-mid]',
    idAttribute: 'data-mid',
    sender: '.peer-title, .name',
    body: '.translatable-message, .message',
    time: '.time-inner, .time',
    timeAttribute: 'title',
    timestampAttribute: 'data-timestamp',
    outgoing: '.is-out',
  },
  chats: {
    item: '.chatlist-chat[data-peer-id]',
    idAttribute: 'data-peer-id',
    title: '.peer-title',
    preview: '.row-subtitle, .dialog-subtitle',
    unread: '.dialog-subtitle-badge-unread, .badge-unread',
    time: '.message-time, .dialog-title-details .time',
  },
  actions: {
    menu: 'contextmenu',
    edit: '.btn-menu-item:has(.tgico-edit), .btn-menu-item:has-text("Edit")',
    delete:
      '.btn-menu-item:has(.tgico-delete), .btn-menu-item.danger, .btn-menu-item:has-text("Delete")',
    deleteForAll: '.popup-delete-message .checkbox-field input',
    deleteConfirm:
      '.popup-delete-message .popup-buttons button.danger, .popup-buttons .btn.danger',
    reaction: (emoji) =>
      `.btn-menu-reactions [data-reaction="${emoji}"], .btn-menu-reactions-reaction:has(img[alt="${emoji}"])`,
    // Web K sends the default reaction on a double click.
    quickReaction: 'dblclick',
    forward:
      '.btn-menu-item:has(.tgico-forward), .btn-menu-item:has-text("Forward")',
    forwardSearch: '.popup-forward .input-search input, .popup-forward input',
    forwardResult: '.popup-forward .chatlist-chat',
  },
};

const whatsapp = {
  id: 'whatsapp',
  name: 'WhatsApp',
  loginUrl: 'https://web.whatsapp.com/',
  // The click-to-chat URL opens the chat and pre-fills the composer.
  // Only a person's number opens a chat this way. A group, a linked id or
  // a `title:` chat has no number: stripping its digits would open the
  // WRONG person's chat, so it is refused (R-Z9).
  chatUrl: (target, { text = '' } = {}) => {
    const ref = parseChatRef(target);
    if (ref?.kind !== 'person') {
      throw Object.assign(
        new Error(
          `whatsapp: "${target}" is not a phone number; WhatsApp Web can only be opened by number from here`
        ),
        { code: 'unsupported-target' }
      );
    }
    const query = text ? `&text=${encodeURIComponent(text)}` : '';
    return `https://web.whatsapp.com/send?phone=${ref.id.slice(1)}${query}`;
  },
  target: ({ chat, to }) => to ?? chat,
  // The stable chat id of a JID or number (E.164 / group JID).
  normalizeChat: chatIdOf,
  loggedIn: '#pane-side, div[aria-label="Chat list"], #main footer',
  loggedOut: 'canvas[aria-label="Scan me!"], div[data-ref], .landing-main',
  composer:
    'footer div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-tab="10"]',
  prefill: true,
  send: {
    selector:
      'button[aria-label="Send"], button[aria-label="Отправить"], span[data-icon="send"]',
    key: 'Enter',
  },
  messages: {
    item: '#main div[data-id]',
    idAttribute: 'data-id',
    // `data-id` is `<out>_<chat jid>_<message id>`: the message id is
    // what the Cloud API calls `wamid`'s last part.
    // Groups add the participant: `false_<group>@g.us_<msg>_<who>@c.us`.
    idPattern: '^(?:true|false)_[^_]+_([^_]+)',
    chatPattern: '^(?:true|false)_([^_]+)_',
    sender: '[data-pre-plain-text]',
    senderAttribute: 'data-pre-plain-text',
    body: 'span.selectable-text, .copyable-text span',
    time: '[data-pre-plain-text]',
    timeAttribute: 'data-pre-plain-text',
    outgoing: '.message-out, [data-id^="true_"]',
  },
  chats: {
    item: '#pane-side div[role="listitem"], #pane-side div[role="row"]',
    title: 'span[title]',
    titleAttribute: 'title',
    preview: 'span[title] ~ div span[dir], div[role="gridcell"] span[dir]',
    unread: 'span[aria-label*="unread"], span[aria-label*="непрочитан"]',
    time: 'div[role="gridcell"] > div:last-child',
  },
  actions: {
    menu: 'span[data-icon="down-context"], [aria-label="Context menu"], [aria-label="Контекстное меню"]',
    edit: '[aria-label="Edit"], [aria-label="Изменить"], li:has-text("Edit")',
    delete:
      '[aria-label="Delete"], [aria-label="Удалить"], li:has-text("Delete")',
    deleteConfirm:
      'button:has-text("Delete for everyone"), button:has-text("Удалить у всех"), button:has-text("Delete for me"), button:has-text("Удалить у меня")',
    deleteForMe:
      'button:has-text("Delete for me"), button:has-text("Удалить у меня")',
    react:
      'span[data-icon="react"], [aria-label="React"], [aria-label="Реакция"]',
    reaction: (emoji) =>
      `[aria-label="${emoji}"], img[alt="${emoji}"], [data-emoji="${emoji}"]`,
    forward:
      '[aria-label="Forward"], [aria-label="Переслать"], li:has-text("Forward")',
    forwardSearch:
      'div[role="dialog"] div[contenteditable="true"], div[role="dialog"] input',
    forwardResult:
      'div[role="dialog"] div[role="listitem"] input, div[role="dialog"] div[role="row"]',
    forwardSend:
      'div[role="dialog"] span[data-icon="send"], div[role="dialog"] [aria-label="Send"]',
  },
};

const x = {
  id: 'x',
  name: 'X',
  loginUrl: 'https://x.com/messages',
  chatUrl: (target) =>
    `https://x.com/messages/${encodeURIComponent(bareId(target))}`,
  target: ({ chat, to }) => chat ?? to,
  loggedIn:
    '[data-testid="AppTabBar_DirectMessage_Link"], [data-testid="DmActivityContainer"], [data-testid="dm-inbox-panel"]',
  loggedOut:
    '[data-testid="loginButton"], a[href="/login"], [data-testid="login"]',
  composer:
    '[data-testid="dmComposerTextInput"], [data-testid="dm-composer-textarea"], div[contenteditable="true"][role="textbox"]',
  prefill: false,
  send: {
    selector:
      '[data-testid="dmComposerSendButton"], [data-testid="dm-composer-send-button"]',
    key: 'Enter',
  },
  messages: {
    item: '[data-testid="messageEntry"], [data-testid^="message-"]',
    body: '[data-testid="tweetText"], [data-testid="messageEntry"] span, div[dir="auto"]',
    time: 'time',
    timeAttribute: 'datetime',
  },
  chats: {
    item: '[data-testid="conversation"], [data-testid^="dm-conversation-item"]',
    link: 'a[href*="/messages/"], a[href*="/chat/"]',
    linkPattern: '/(?:messages|chat)/([^/?#]+)',
    title: '[data-testid="conversation"] [dir="ltr"] span, span[dir="ltr"]',
    preview: '[data-testid="tweetText"], div[dir="auto"]',
    time: 'time',
  },
  actions: {
    menu: '[data-testid="messageEntry"] [aria-label="More"], [aria-label="More actions"]',
    delete:
      '[role="menuitem"]:has-text("Delete for you"), [role="menuitem"]:has-text("Delete")',
    deleteConfirm: '[data-testid="confirmationSheetConfirm"]',
    react: '[aria-label="React"], [data-testid="reaction-button"]',
    reaction: (emoji) => `[aria-label="${emoji}"], [data-emoji="${emoji}"]`,
  },
};

const facebook = {
  id: 'facebook',
  name: 'Facebook',
  loginUrl: 'https://www.facebook.com/messages/',
  chatUrl: (target) =>
    `https://www.facebook.com/messages/t/${encodeURIComponent(bareId(target))}`,
  target: ({ chat, to }) => chat ?? to,
  loggedIn:
    'div[aria-label="Chats"], div[role="navigation"] a[href*="/messages/t/"], div[aria-label="Messenger"]',
  loggedOut: '#login_form, form[data-testid="royal_login_form"], #email',
  composer:
    'div[role="textbox"][contenteditable="true"][aria-label], div[contenteditable="true"][role="textbox"]',
  prefill: false,
  send: {
    selector: 'div[aria-label="Press Enter to send"], div[aria-label="Send"]',
    key: 'Enter',
  },
  messages: {
    item: 'div[role="row"]',
    body: 'div[dir="auto"]',
    time: 'span[data-tooltip-content], abbr',
    timeAttribute: 'aria-label',
  },
  chats: {
    item: 'div[aria-label="Chats"] a[href*="/messages/t/"], a[href*="/messages/t/"][role="link"]',
    link: 'a[href*="/messages/t/"]',
    linkPattern: '/messages/t/([^/?#]+)',
    title: 'span[dir="auto"]',
    preview: 'span[dir="auto"] + div span, div > span > span',
  },
  actions: {
    menu: 'div[aria-label="More"], div[aria-label="Ещё"]',
    delete:
      'div[role="menuitem"]:has-text("Unsend"), div[role="menuitem"]:has-text("Remove"), div[role="menuitem"]:has-text("Удалить")',
    deleteConfirm:
      'div[aria-label="Unsend"], div[aria-label="Remove"], div[role="dialog"] div[role="button"]:has-text("Remove")',
    edit: 'div[role="menuitem"]:has-text("Edit"), div[role="menuitem"]:has-text("Изменить")',
    react: 'div[aria-label="React"], div[aria-label="Реакция"]',
    reaction: (emoji) =>
      `div[role="dialog"] img[alt="${emoji}"], div[aria-label="${emoji}"]`,
    forward:
      'div[role="menuitem"]:has-text("Forward"), div[role="menuitem"]:has-text("Переслать")',
    forwardSearch:
      'div[role="dialog"] input[type="search"], div[role="dialog"] input',
    forwardResult:
      'div[role="dialog"] div[aria-label="Send"], div[role="dialog"] div[role="button"]:has-text("Send")',
  },
};

const linkedin = {
  id: 'linkedin',
  name: 'LinkedIn',
  loginUrl: 'https://www.linkedin.com/messaging/',
  chatUrl: (target) =>
    `https://www.linkedin.com/messaging/thread/${encodeURIComponent(bareId(target))}/`,
  target: ({ chat, to }) => chat ?? to,
  loggedIn:
    '.msg-conversations-container, .msg-overlay-list-bubble, #global-nav',
  loggedOut: '.sign-in-form, form.login__form, #username',
  composer:
    '.msg-form__contenteditable[contenteditable="true"], div[role="textbox"][contenteditable="true"]',
  prefill: false,
  send: { selector: 'button.msg-form__send-button', key: 'Enter' },
  messages: {
    item: '.msg-s-event-listitem',
    idAttribute: 'data-event-urn',
    idPattern: ',([^,)]+)\\)?$',
    sender: '.msg-s-message-group__name',
    body: '.msg-s-event-listitem__body',
    time: 'time.msg-s-message-group__timestamp, time',
    outgoing: ':not(.msg-s-event-listitem--other)',
  },
  chats: {
    item: '.msg-conversation-listitem, li.msg-conversations-container__convo-item',
    link: 'a.msg-conversation-listitem__link, a[href*="/messaging/thread/"]',
    linkPattern: '/messaging/thread/([^/?#]+)',
    title: '.msg-conversation-listitem__participant-names, h3',
    preview: '.msg-conversation-card__message-snippet, p',
    unread: '.msg-conversation-card__unread-count, .notification-badge',
    time: 'time',
  },
  actions: {
    menu: '.msg-s-event-listitem__options-trigger, button[aria-label*="Open the options"]',
    edit: '.msg-s-event-listitem__edit, [role="button"]:has-text("Edit"), div:has-text("Edit") > button',
    delete:
      '[role="button"]:has-text("Delete"), div:has-text("Delete") > button',
    deleteConfirm:
      '.artdeco-modal button.artdeco-button--primary, button:has-text("Delete")',
    editSave:
      '.msg-form__footer button:has-text("Save"), button:has-text("Save")',
    react: '.msg-s-event-listitem__react-button, button[aria-label*="React"]',
    reaction: (emoji) =>
      `button[aria-label*="${emoji}"], .msg-reactions-picker button:has-text("${emoji}")`,
  },
};

const upwork = {
  id: 'upwork',
  name: 'Upwork',
  loginUrl: 'https://www.upwork.com/ab/messages/',
  chatUrl: (target) =>
    `https://www.upwork.com/ab/messages/rooms/${encodeURIComponent(bareId(target))}`,
  target: ({ chat, to }) => chat ?? to,
  loggedIn: '[data-test="room-list"], .room-list, [data-test="messages-app"]',
  loggedOut: '#login_username, form[action*="login"], [data-qa="login"]',
  composer:
    '[data-test="composer"] [contenteditable="true"], .composer-container [contenteditable="true"], textarea[data-test="message-input"]',
  prefill: false,
  send: {
    selector: 'button[data-test="send-message"], button[aria-label="Send"]',
    key: 'Enter',
  },
  messages: {
    item: '[data-test="story-container"], .up-d-story-item',
    idAttribute: 'data-story-id',
    sender: '[data-test="story-sender"], .user-name',
    body: '[data-test="story-message"], .up-d-story-message',
    time: 'time, [data-test="story-time"]',
    timeAttribute: 'datetime',
  },
  chats: {
    item: '[data-test="room-list"] [data-test="room-item"], .room-list-item',
    link: 'a[href*="/rooms/"]',
    linkPattern: '/rooms/([^/?#]+)',
    title: '[data-test="room-name"], .room-name',
    preview: '[data-test="room-last-message"], .room-last-story',
    unread: '[data-test="unread-badge"], .badge',
  },
  actions: {
    menu: '[data-test="story-actions"], button[aria-label="Message actions"]',
    edit: '[data-test="edit-story"], li:has-text("Edit")',
    delete: '[data-test="delete-story"], li:has-text("Delete")',
    deleteConfirm: '[data-test="confirm-delete"], button:has-text("Delete")',
    editSave: '[data-test="save-edit"], button:has-text("Save")',
  },
};

const freeze = (ui) =>
  Object.freeze({
    ...ui,
    messages: Object.freeze(ui.messages),
    chats: Object.freeze(ui.chats),
    actions: Object.freeze(ui.actions),
  });

export const WEB_UIS = Object.freeze({
  vk: freeze(vk),
  telegram: freeze(telegram),
  whatsapp: freeze(whatsapp),
  x: freeze(x),
  facebook: freeze(facebook),
  linkedin: freeze(linkedin),
  upwork: freeze(upwork),
});
