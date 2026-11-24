import { Buffer } from 'node:buffer';
import {
  normalizeEmailRecord,
  parseRfc822Message,
} from '../../js/src/sources/email.js';
import {
  apiLink,
  apiLinkRule,
  apiLinkAutomation,
} from './question-api-links-fixture.mjs';

export { apiLinkRule };
export const emailLinkKinds = ['mime', 'gmail', 'jmap', 'graph'];
export const emailLinkAutomation = {
  ...apiLinkAutomation,
  id: 'automation:email-links',
  name: 'Email link review',
};
export const emailLinkTarget = (kind, changed = false) =>
  kind === 'graph'
    ? `mailto:tasks@example.test?subject=Assignment%20${changed ? 'Two' : 'One'}`
    : changed
      ? apiLink.second
      : apiLink.first;

/** Actual MIME/provider normalizers, with a distinct HTML alternative. */
export const emailLinkMessage = (kind = 'mime', changed = false) => {
  const target = emailLinkTarget(kind, changed);
  const html = `Do you have <a href="${target}">experience</a>?`;
  const plain = apiLink.question;
  if (kind === 'mime') {
    return parseRfc822Message(
      [
        'From: them@example.test',
        'To: me@example.test',
        'Message-ID: <question@example.test>',
        'Date: Sun, 15 Nov 2026 00:00:00 +0000',
        'Content-Type: multipart/alternative; boundary="question-parts"',
        '',
        '--question-parts',
        'Content-Type: text/plain; charset=utf-8',
        '',
        plain,
        '--question-parts',
        'Content-Type: text/html; charset=utf-8',
        '',
        html,
        '--question-parts--',
        '',
      ].join('\r\n')
    );
  }
  const common = {
    id: 'question',
    threadId: '7',
    receivedAt: '2026-11-15T00:00:00Z',
  };
  if (kind === 'gmail') {
    return normalizeEmailRecord({
      id: 'question',
      threadId: '7',
      internalDate: String(Date.parse(common.receivedAt)),
      payload: {
        headers: [{ name: 'from', value: 'them@example.test' }],
        mimeType: 'multipart/alternative',
        parts: [
          ['text/plain', plain],
          ['text/html', html],
        ].map(([mimeType, value]) => ({
          mimeType,
          body: { data: Buffer.from(value).toString('base64url') },
        })),
      },
    });
  }
  if (kind === 'graph') {
    return normalizeEmailRecord({
      ...common,
      conversationId: '7',
      receivedDateTime: common.receivedAt,
      from: { emailAddress: { address: 'them@example.test' } },
      body: { contentType: 'html', content: html },
    });
  }
  return normalizeEmailRecord({
    ...common,
    from: [{ email: 'them@example.test' }],
    textBody: [{ partId: 'plain', type: 'text/plain' }],
    htmlBody: [{ partId: 'html', type: 'text/html' }],
    bodyValues: { plain: { value: plain }, html: { value: html } },
  });
};
