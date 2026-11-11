import { textReplyHtml } from './text-reply-fixture.mjs';
import { noticeText } from './notice-fixture.mjs';

/** Complete, finite employer conversation; all requests are routed locally. */
export const noticePolicyHtml = ({
  body = noticeText,
  earlier,
  support = false,
  closed = false,
} = {}) =>
  textReplyHtml
    .replace('Do you have distributed systems experience?', body)
    .replace(
      '<main id="history">',
      `<header><strong data-qa="participant-info-title">Fixture employer</strong>${support ? '' : '<div data-qa="chatik-header-sub-header"><a href="https://hh.ru/vacancy/123">Engineer</a></div>'}</header><main id="history"><article data-qa="chatik-chat-message-1"><strong data-qa="chat-bubble-title">Vacancy application</strong><p data-qa="chat-bubble-text"></p></article>${earlier ? `<article data-qa="chatik-chat-message-100"><p data-qa="chat-bubble-text">${earlier}</p></article>` : ''}`
    )
    .replace(
      '</style>',
      '#history{max-height:300px;overflow-y:auto}header{background:white;padding:12px;border-radius:8px}header a{display:block;margin-top:6px}</style>'
    )
    .replace(
      '<p id="status"',
      `${closed ? '<p>Conversation is closed</p>' : ''}<p id="status"`
    );
