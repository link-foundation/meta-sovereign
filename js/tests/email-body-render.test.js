// A mail in its bubble (R-Z5): the page draws the server's safe tree with
// elements only, whatever the tree says, lists attachments with a download
// link each, and the Email card has its "Fetch mail now" button in every
// language. Static markup only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import {
  EmailBody,
  EmailTree,
  emailBubble,
} from '../src/web/chat-email-body.js';
import { EmailPullRow } from '../src/web/connections/email-pull.js';
import { parseMessageParts } from '../src/web/message-parts.js';
import { dictionaries } from '../src/web/locales/index.js';
import { renderInLocale } from './util-render.js';

const el = React.createElement;
const html = (node) => renderInLocale('en', node);

test('draws formatting, a table and a safe link', () => {
  const markup = html(
    el(EmailTree, {
      tree: [
        { t: 'p', c: [{ t: 'b', c: [{ t: 'text', s: 'Hi' }] }] },
        {
          t: 'a',
          href: 'https://example.com/x',
          c: [{ t: 'text', s: 'site' }],
        },
        {
          t: 'table',
          c: [
            {
              t: 'tr',
              c: [{ t: 'td', colSpan: 2, c: [{ t: 'text', s: 'cell' }] }],
            },
          ],
        },
      ],
      cid: () => null,
    })
  );
  assert.match(markup, /<p><b>Hi<\/b><\/p>/);
  assert.match(
    markup,
    /<a href="https:\/\/example.com\/x" target="_blank" rel="noopener noreferrer nofollow"/
  );
  assert.match(markup, /<td colSpan="2">cell<\/td>/);
});

test('draws nothing a hostile tree asks for', () => {
  const markup = html(
    el(EmailTree, {
      tree: [
        { t: 'script', c: [{ t: 'text', s: 'alert(1)' }] },
        { t: 'a', href: 'javascript:alert(1)', c: [{ t: 'text', s: 'click' }] },
        { t: 'iframe', src: 'https://evil.example', c: [] },
        { t: 'img', cid: 'x', alt: '<img src=x onerror=alert(1)>' },
        { t: 'text', s: '<b onmouseover=alert(1)>text</b>' },
      ],
      cid: () => null,
    })
  );
  assert.doesNotMatch(markup, /<script|javascript:|<iframe|evil|<img |<b /);
  // Text is text.
  assert.match(markup, /&lt;b onmouseover=alert\(1\)&gt;text&lt;\/b&gt;/);
});

test('an inline picture is a part of the same mail, a download is listed', () => {
  const message = {
    id: 'msg:email:1',
    source: 'email',
    bodyTree: [{ t: 'img', cid: 'pic@x', alt: 'logo' }],
    attachments: [
      {
        kind: 'file',
        name: 'pic.png',
        mime: 'image/png',
        cid: 'pic@x',
        inline: true,
        size: 10,
      },
      { kind: 'file', name: 'report.pdf', mime: 'application/pdf', size: 2048 },
    ],
  };
  const api = { emailAttachmentUrl: async () => '/x' };
  // The effect has not run in static markup: no address, so no picture and
  // no download link yet, but the list is there and the inline one is not.
  const markup = html(el(EmailBody, { message, api }));
  assert.match(markup, /report\.pdf/);
  assert.match(markup, /application\/pdf · 2 KB/);
  assert.doesNotMatch(markup, /pic\.png/);
  assert.doesNotMatch(markup, /<img/);
});

test('only email gets this part of the bubble', () => {
  assert.equal(
    emailBubble({ source: 'telegram', attachments: [{}] }, null),
    null
  );
  assert.equal(emailBubble({ source: 'email' }, null), null);
  assert.ok(
    emailBubble({ source: 'email', bodyTree: [{ t: 'text', s: 'x' }] }, null)
  );
});

test('a mail with a tree shows the tree, not its text twice, and lists its own attachments', () => {
  const parts = parseMessageParts({
    id: 'msg:email:1',
    source: 'email',
    body: 'Plain form',
    bodyTree: [{ t: 'text', s: 'Rich form' }],
    attachments: [{ kind: 'file', name: 'a.pdf', mime: 'application/pdf' }],
  });
  assert.equal(parts.text, '');
  assert.equal(parts.media, null);
  const plain = parseMessageParts({
    id: 'msg:email:2',
    source: 'email',
    body: 'Only text',
  });
  assert.equal(plain.text, 'Only text');
});

test('the Fetch mail button is translated in every language', () => {
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const markup = renderInLocale(locale, el(EmailPullRow));
    const label = dictionaries[locale]['email.pull.button'];
    assert.ok(label);
    assert.ok(markup.includes(label), locale);
    assert.match(markup, /data-action="email-pull"/);
    if (locale !== 'en') {
      assert.notEqual(label, dictionaries.en['email.pull.button']);
      assert.notEqual(
        dictionaries[locale]['email.attachments'],
        dictionaries.en['email.attachments']
      );
    }
  }
});
