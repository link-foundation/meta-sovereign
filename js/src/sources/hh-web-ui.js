const origins = ['https://hh.ru', 'https://www.hh.ru', 'https://chatik.hh.ru'];
const invalid = () =>
  Object.assign(
    new Error('HH requires an explicit numeric web-chat reference'),
    {
      code: 'unsupported-target',
      fallback: false,
    }
  );

/** API chat UUIDs and negotiation IDs are not web-chat associations. */
export const hhWebChatId = (value) => {
  const text = String(value ?? '').trim();
  if (/^\d{1,30}$/u.test(text)) {
    return text;
  }
  try {
    const url = new URL(text);
    const match = /^\/chat\/(\d{1,30})\/?$/u.exec(url.pathname);
    if (
      origins.includes(url.origin) &&
      !url.username &&
      !url.password &&
      match
    ) {
      return match[1];
    }
  } catch {
    // A non-URL identifier still needs a verified web association.
  }
  throw invalid();
};

export const hhWebChatUrl = (target, { browserUrl } = {}) => {
  const chat = hhWebChatId(target);
  if (!browserUrl) {
    return `https://hh.ru/chat/${chat}`;
  }
  try {
    const url = new URL(browserUrl);
    if (
      origins.slice(0, 2).includes(url.origin) &&
      !url.username &&
      !url.password
    ) {
      const route = /^\/chat\/(\d+)\/?$/u.exec(url.pathname);
      if (!route || route[1] === chat) {
        return url.href;
      }
    }
  } catch {
    // Invalid application pages must never open a different host or chat.
  }
  throw invalid();
};

/** Public HH DOM contract; selectors remain overrideable like other providers. */
export const HH_WEB_UI = {
  id: 'hh',
  name: 'HeadHunter',
  loginUrl: 'https://hh.ru/account/login',
  listUrl: 'https://hh.ru/chat',
  chatUrl: hhWebChatUrl,
  target: ({ chat, to }) => hhWebChatId(chat ?? to),
  loggedIn:
    '[data-qa^="chatik-chat-message-"], textarea[data-qa="text-input"], iframe[src^="https://chatik.hh.ru/"], [data-qa="mainmenu_applicantProfile"]',
  loggedOut: '[data-qa="account-login-submit"], form[action*="account/login"]',
  composer: 'textarea[data-qa="text-input"]',
  location: { origins, pathPattern: '^/chat/(\\d{1,30})/?$' },
  documents: { ownerOrigins: origins, ancestorOrigins: origins, maxFrames: 32 },
  chatScan: { pathPattern: '^/chat/?$' },
  choices: {
    group:
      '[class*="buttons-wrapper"], [class*="reply-options"], [data-qa*="answer-options"], [data-qa*="question-options"]',
    attachedButtons: true,
    genericGroup:
      '[class*="buttons-wrapper"]:not([class*="reply-options"]):not([data-qa*="answer-options"]):not([data-qa*="question-options"])',
    genericPattern:
      '^(?:здравствуйте|какая схема оплаты|где находится место работы|можно без опыта|какой график работы|могу работать в гибком графике|у меня есть профильный опыт|hello|नमस्ते|你好)[.!?]*$',
    button: 'button, [role="button"], [role="option"]',
  },
  messages: {
    item: '[data-qa^="chatik-chat-message-"]',
    idAttribute: 'data-qa',
    idPattern: '^chatik-chat-message-(\\d+)$',
    body: '[data-qa="chat-bubble-text"]',
    outgoing:
      '[data-qa="status-icon-delivered"], [data-qa="status-icon-read"], [data-qa="status-icon-sent"]',
    timestampAttribute: 'data-time',
    serviceTitle:
      '[data-qa="chat-bubble-title"], [data-qa="chat-bubble-author-name"]',
    serviceTitlePattern:
      '^(?:отклик на вакансию|vacancy application|(?:application for|response to) (?:the|a) vacancy|bewerbung)$',
  },
  chats: {
    item: '[data-qa^="chatik-open-chat-"], a[href^="/chat/"]',
    idAttribute: 'data-qa',
    idPattern: '^chatik-open-chat-(\\d{1,30})$',
    requireId: true,
    uniqueIds: true,
    link: 'a[href^="/chat/"]',
    linkPattern: '^/chat/(\\d{1,30})(?:[/?#]|$)',
    title: '[data-qa="chat-cell-title"], [data-qa="chat-title"]',
    preview: '[class*="last-message-color_"], [data-qa="chat-last-message"]',
    unread:
      '[data-qa="chat-unread-count"], [data-qa*="badge"], [data-qa*="counter"]',
  },
  actions: {},
};
