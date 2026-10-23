// The rich-text kinds of rich messages and Instant View pages (R-Y225;
// learned, never copied): mentions, hashtags, automatic links, custom
// emoji, buttons, dates, cards and formulas. Shaping and drawing with
// synthetic data; KaTeX typesets in node, offline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  richPlainText,
  shapeText,
} from '../src/sources/telegram-instant-view-shape.js';
import { Blocks } from '../src/web/chat-instant-view-render.js';
import { mathMl } from '../src/web/rich-math.js';
import { buttonOf } from '../src/web/bot-keyboard.js';

const text = (s) => ({ className: 'TextPlain', text: s });
const kind = (className, s, extra = {}) => ({
  className,
  text: text(s),
  ...extra,
});

const ctx = (extra = {}) => ({
  t: (key) => key,
  locale: 'en',
  media: () => null,
  scrollTo: () => {},
  ...extra,
});

const draw = (rich, extra) =>
  renderToStaticMarkup(
    React.createElement(Blocks, {
      blocks: [{ k: 'p', c: shapeText(rich) }],
      ctx: ctx(extra),
    })
  );

test('a mention is a link to the person, a bad one stays words', () => {
  assert.deepEqual(shapeText(kind('TextMention', '@some_user')), [
    {
      t: 'a',
      href: 'https://t.me/some_user',
      c: [{ t: 'text', s: '@some_user' }],
    },
  ]);
  assert.deepEqual(shapeText(kind('TextMention', '@a b')), [
    { t: 'text', s: '@a b' },
  ]);
});

test('automatic urls, e-mails and phones are links like a message entity', () => {
  const href = (rich) => shapeText(rich)[0].href;
  assert.equal(
    href(kind('TextAutoUrl', 'example.test/x')),
    'https://example.test/x'
  );
  assert.equal(href(kind('TextAutoUrl', 'http://a.test/')), 'http://a.test/');
  assert.equal(href(kind('TextAutoEmail', 'me@a.test')), 'mailto:me@a.test');
  assert.equal(href(kind('TextAutoPhone', '+1 (234) 567')), 'tel:+1234567');
  // A script address is no link, only words.
  assert.deepEqual(shapeText(kind('TextAutoUrl', 'javascript:alert(1)')), [
    { t: 'text', s: 'javascript:alert(1)' },
  ]);
});

test('hashtags, cashtags and commands are tags; a command is never sent', () => {
  for (const name of ['TextHashtag', 'TextCashtag', 'TextBotCommand']) {
    assert.equal(shapeText(kind(name, '#x'))[0].t, 'tag');
  }
  const html = draw(kind('TextHashtag', '#weekly'));
  assert.match(html, /data-tag="#weekly"/);
  assert.match(html, /role="button"/);
  const command = draw(kind('TextBotCommand', '/start'));
  assert.doesNotMatch(command, /role="button"|<a |<button/);
  assert.match(command, /msg-tag/);
});

test('a custom emoji is its picture where the page can fetch it', () => {
  const rich = {
    className: 'TextCustomEmoji',
    documentId: '5001',
    alt: '\u{1F44D}',
  };
  assert.deepEqual(shapeText(rich), [
    { t: 'emoji', id: '5001', s: '\u{1F44D}' },
  ]);
  assert.match(
    draw(rich, { api: { telegramCustomEmojiUrl: async () => null } }),
    /data-custom-emoji="5001"[^]*\u{1F44D}/u
  );
  // No api, or a bad id: the emoji it stands for.
  assert.equal(draw(rich), '<p class="iv-p">\u{1F44D}</p>');
  assert.deepEqual(shapeText({ ...rich, documentId: 'x' }), [
    { t: 'text', s: '\u{1F44D}' },
  ]);
  assert.equal(
    richPlainText({
      blocks: [{ className: 'PageBlockParagraph', text: rich }],
    }),
    '\u{1F44D}'
  );
});

test('people by id, cards and dates keep their words and data', () => {
  assert.deepEqual(
    shapeText(kind('TextMentionName', 'Ann', { userId: '42' }))[0],
    {
      t: 'user',
      id: '42',
      s: 'Ann',
      c: [{ t: 'text', s: 'Ann' }],
    }
  );
  assert.match(
    draw(kind('TextMentionName', 'Ann', { userId: '42' })),
    /msg-mention-name" data-user="42">Ann/
  );
  assert.match(draw(kind('TextBankCard', '4111 1111')), /data-bankcard="copy"/);
  const date = kind('TextDate', '5 PM', { date: 1700000000, shortTime: true });
  assert.equal(shapeText(date)[0].date, 1700000000);
  assert.match(draw(date), /<time[^>]*dateTime="2023-11-14T22:13:20.000Z"/);
});

test('a button in the text is the context button, else inert words', () => {
  const rich = {
    className: 'TextButton',
    text: text('Go'),
    type: { className: 'InlineButtonTypeUrl', url: 'https://a.test/' },
    style: { bgPrimary: true, link: true },
  };
  const [node] = shapeText(rich);
  assert.equal(node.t, 'button');
  assert.equal(node.style.link, true);
  assert.equal(
    buttonOf({ text: 'Go', style: node.style, type: node.type }).tone,
    'link'
  );
  const seen = [];
  const html = draw(rich, {
    button: (one) => {
      seen.push(one.type.url);
      return React.createElement('button', { 'data-bot-button': 'url' }, 'Go');
    },
  });
  assert.deepEqual(seen, ['https://a.test/']);
  assert.match(html, /iv-inline-button/);
  assert.match(draw(rich), /is-inert[^>]*>Go</);
});

test('a formula is typeset as MathML, and a broken one stays LaTeX', async () => {
  assert.match(await mathMl('x^2+y^2'), /<math/);
  assert.match(await mathMl('\\frac{a}{b}', true), /<mfrac/);
  assert.doesNotMatch(await mathMl('\\frac{a}{b}'), /katex-html/);
  // trust false: no link from the source.
  assert.doesNotMatch(
    await mathMl('\\href{javascript:alert(1)}{x}'),
    /<a |href=/
  );
  assert.equal(await mathMl('\\unknownmacro{'), '');
  const rich = { className: 'TextMath', source: 'x^2+y^2' };
  const html = draw(rich);
  assert.match(html, /<math/);
  assert.match(html, /data-math="mathml"/);
  assert.match(
    draw({ className: 'TextMath', source: '\\unknownmacro{' }),
    /<code[^>]*data-math="latex"/
  );
  const block = renderToStaticMarkup(
    React.createElement(Blocks, {
      blocks: [{ k: 'math', source: '\\frac{a}{b}' }],
      ctx: ctx(),
    })
  );
  assert.match(block, /data-block="math"/);
});
