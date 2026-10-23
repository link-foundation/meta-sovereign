// Service messages and newer entities (R-Y221): every action of the layer
// has words, the people are named, "You" where the user did it, and the
// formatted-date, bank-card and diff entities draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { serviceInfo, parseMessageParts } from '../src/web/message-parts.js';
import {
  fillParams,
  moneyText,
  periodOf,
  serviceTextInfo,
  WORDED_ACTIONS,
} from '../src/web/service-texts.js';
import { translate } from '../src/web/i18n.js';
import { dictionaries } from '../src/web/locales/index.js';
import { formattedDateText } from '../src/web/entity-extras.js';
import { textTree, MessageText } from '../src/web/message-text.js';
import { webpageKindOf } from '../src/web/webpage-kind.js';
import { actionNamesOf } from '../src/sources/telegram-service-names.js';

const TL = readFileSync(
  new URL('../src/sources/telegram-api/layer-225.tl', import.meta.url),
  'utf8'
);
const ACTIONS = [...TL.matchAll(/^messageAction(\w+)#/gm)].map(
  (m) => `MessageAction${m[1]}`
);

const en = (key, vars) => translate('en', key, vars);
const say = (link, locale = 'en') => {
  const info = serviceInfo(link);
  const t = (key, vars) => translate(locale, key, vars);
  return t(info.key, fillParams(t, info.params, locale));
};

// One action holding the fields of many, so every wording has its data.
const RICH = {
  users: ['7', '8'],
  userId: '7',
  newCreatorId: '7',
  botId: '7',
  title: 'Team',
  period: 604800,
  days: 90,
  stars: 50,
  boosts: 3,
  score: 5,
  message: 'Hello',
  text: 'Open',
  domain: 'example.org',
  currency: 'USD',
  amount: 499,
  totalAmount: 1234,
  cryptoAmount: 2500000000,
  scheduleDate: 1800000000,
  theme: { className: 'ChatTheme', emoticon: '🎄' },
  gift: { title: 'Plush', num: 12, stars: 25, slug: 'Plush-12' },
  price: { amount: 100 },
  birthday: { day: 3, month: 5, year: 1990 },
  answer: { text: { text: 'Yes' } },
  list: [{ id: 1, title: { text: 'Milk' } }],
  completed: [1],
  incompleted: [],
  types: [{ className: 'SecureValueTypePassport' }],
  photo: { id: '1' },
  newValue: true,
  duration: 65,
  distance: 100,
  peers: [],
};
const NAMES = { 7: { name: 'Bob' }, 8: { name: '', self: true } };

const linkOf = (service, extra = {}) => ({
  id: 'msg:telegram:5:9',
  service,
  sender: '4',
  senderName: 'Ann',
  chatName: 'Team',
  chatType: 'group',
  raw: { action: { ...RICH }, actionNames: NAMES },
  ...extra,
});

test('every messageAction of the layer has words of its own', () => {
  assert.ok(ACTIONS.length >= 60, `found ${ACTIONS.length}`);
  for (const service of ACTIONS) {
    for (const link of [
      linkOf(service),
      linkOf(service, { sender: 'me', senderName: null }),
      { id: 'x', service, raw: { action: {} } },
    ]) {
      const info = serviceInfo(link);
      if (service === 'MessageActionEmpty') {
        assert.equal(info.hidden, true);
        continue;
      }
      assert.notEqual(info.key, 'chat.service.unknown', service);
      for (const [locale, dictionary] of Object.entries(dictionaries)) {
        assert.equal(
          typeof dictionary[info.key],
          'string',
          `${service}: ${info.key} missing in ${locale}`
        );
      }
    }
  }
});

test('every worded action is a real constructor, and every param key exists', () => {
  for (const service of WORDED_ACTIONS) {
    assert.ok(ACTIONS.includes(service), service);
  }
  for (const service of ACTIONS) {
    for (const link of [
      linkOf(service),
      linkOf(service, { sender: 'me', senderName: null }),
    ]) {
      const info = serviceTextInfo(link);
      if (!info || info.hidden) {
        continue;
      }
      const text = say(link);
      assert.ok(!/undefined|\[object|{\w+}/.test(text), `${service}: ${text}`);
    }
  }
});

test('unknown future actions show a neutral service message', () => {
  const info = serviceInfo({ service: 'MessageActionFuture', raw: {} });
  assert.equal(info.key, 'chat.service.unknown');
  assert.equal(en(info.key), 'Service message');
});

test('the people are named, and "You" where the user did it', () => {
  assert.equal(say(linkOf('MessageActionChatAddUser')), 'Ann added Bob, you');
  assert.equal(
    say(linkOf('MessageActionChatAddUser', { sender: 'me', senderName: null })),
    'You added Bob, you'
  );
  assert.equal(
    say(
      linkOf('MessageActionChatAddUser', {
        sender: '7',
        senderName: 'Bob',
        raw: { action: { users: ['7'] }, actionNames: NAMES },
      })
    ),
    'Bob joined the group'
  );
  assert.equal(
    say(linkOf('MessageActionChatJoinedByRequest')),
    'Ann was accepted into the group'
  );
  assert.equal(
    say(linkOf('MessageActionInviteToGroupCall')),
    'Ann invited Bob, you to the group call'
  );
  assert.equal(say(linkOf('MessageActionChatDeleteUser')), 'Ann removed Bob');
});

test('photos, boosts, auto-delete, themes and wallpapers', () => {
  const photo = serviceInfo(linkOf('MessageActionChatEditPhoto'));
  assert.equal(photo.photo, true);
  assert.equal(
    say(linkOf('MessageActionChatEditPhoto')),
    'Ann changed the group photo'
  );
  assert.equal(
    say(linkOf('MessageActionChatEditPhoto', { chatType: 'channel' })),
    'Channel photo updated'
  );
  assert.equal(
    say(linkOf('MessageActionChatDeletePhoto')),
    'Ann removed the group photo'
  );
  assert.equal(
    say(linkOf('MessageActionBoostApply')),
    'Ann boosted this chat 3 times'
  );
  assert.equal(
    say(linkOf('MessageActionBoostApply', { sender: 'me' })),
    'You boosted this chat 3 times'
  );
  assert.equal(
    say(linkOf('MessageActionSetMessagesTTL', { sender: 'me' })),
    'You set messages to auto-delete in 1 week'
  );
  assert.equal(
    say({
      ...linkOf('MessageActionSetMessagesTTL'),
      raw: { action: { period: 0 } },
    }),
    'Ann turned off auto-delete'
  );
  assert.equal(
    say(linkOf('MessageActionSetChatTheme')),
    'Ann changed the chat theme to 🎄'
  );
  assert.equal(
    say(linkOf('MessageActionSetChatWallPaper')),
    'Ann set a new wallpaper for this chat'
  );
  assert.equal(
    say(linkOf('MessageActionNewCreatorPending')),
    'Bob will become the owner of this chat once the transfer is complete'
  );
  assert.equal(say(linkOf('MessageActionHistoryClear')), 'History was cleared');
  assert.equal(
    say(linkOf('MessageActionScreenshotTaken')),
    'Ann took a screenshot!'
  );
});

test('Russian plurals and periods', () => {
  const link = linkOf('MessageActionBoostApply');
  assert.equal(say(link, 'ru'), 'Ann усилил(а) этот чат 3 раза');
  assert.deepEqual(periodOf(86400), { unit: 'day', count: 1 });
  assert.deepEqual(periodOf(2678400), { unit: 'month', count: 1 });
  assert.deepEqual(periodOf(172800), { unit: 'day', count: 2 });
  assert.deepEqual(periodOf(45), { unit: 'second', count: 45 });
});

test('payments, gifts and checklists', () => {
  assert.equal(moneyText('USD', 1234, 'en-US'), '$12.34');
  assert.equal(moneyText('XTR', 50, 'en-US'), '50 ⭐');
  assert.match(say(linkOf('MessageActionPaymentSent')), /^You paid .*12[.,]34/);
  assert.match(
    say(linkOf('MessageActionGiftPremium')),
    /Telegram Premium for 3 months/
  );
  assert.equal(
    say(linkOf('MessageActionStarGiftUnique')),
    'Ann sent you a unique gift: Plush #12'
  );
  assert.equal(
    serviceInfo(linkOf('MessageActionStarGiftUnique')).giftSlug,
    'Plush-12'
  );
  assert.equal(
    say({
      ...linkOf('MessageActionTodoCompletions'),
      raw: { action: { completed: [1], incompleted: [] } },
    }),
    'Ann completed Someone'
  );
  const replied = () => ({
    raw: { media: { todo: { list: [{ id: 1, title: { text: 'Milk' } }] } } },
  });
  const info = serviceTextInfo(linkOf('MessageActionTodoCompletions'), replied);
  assert.deepEqual(info.params.tasks, ['“Milk”']);
  assert.equal(
    say(linkOf('MessageActionPollAppendAnswer')),
    'Ann added the option “Yes”'
  );
  assert.equal(
    say(linkOf('MessageActionSuggestBirthday')),
    'Ann suggests you to set May 3, 1990 as your birthday'
  );
});

test('parseMessageParts keeps a service photo flag and hides Empty', () => {
  const parts = parseMessageParts(linkOf('MessageActionChatEditPhoto'));
  assert.equal(parts.service.photo, true);
  assert.equal(
    parseMessageParts(linkOf('MessageActionEmpty')).service.hidden,
    true
  );
});

test('action names come from the message entity map', () => {
  const entities = new Map([
    ['7', { firstName: 'Bob', lastName: 'Fake' }],
    ['8', { firstName: 'Me', self: true }],
    ['-1005', { title: 'Team' }],
  ]);
  const names = actionNamesOf({
    action: {
      users: [7n, 8n],
      fromId: { channelId: 5n },
    },
    _entities: entities,
  });
  assert.deepEqual(names, {
    7: { name: 'Bob Fake', self: false },
    8: { name: 'Me', self: true },
    '-1005': { name: 'Team', self: false },
  });
  assert.equal(actionNamesOf({ action: { users: [1] } }), null);
});

// ---- entities --------------------------------------------------------------

test('a formatted date is written in the locale from its flags', () => {
  const date = Date.UTC(2030, 0, 15, 12, 0) / 1000;
  const now = Date.UTC(2030, 0, 15, 7, 0);
  const rel = formattedDateText({ relative: true, date }, 'en', now);
  assert.match(rel, /in 5 hours/);
  const day = formattedDateText(
    { longDate: true, dayOfWeek: true, date },
    'en'
  );
  assert.match(day, /2030/);
  assert.match(day, /Monday|Tuesday|Wednesday/);
  assert.equal(formattedDateText({ date: 0 }, 'en'), '');
  assert.equal(formattedDateText({ date }, 'en'), '');
});

test('entities: bank card, date, diff marks and unknown', () => {
  const text = 'card 4111 old new gone x';
  const tree = textTree(text, [
    { className: 'MessageEntityBankCard', offset: 5, length: 4 },
    { className: 'MessageEntityDiffInsert', offset: 14, length: 3 },
    { className: 'MessageEntityDiffDelete', offset: 18, length: 4 },
    {
      className: 'MessageEntityDiffReplace',
      offset: 10,
      length: 3,
      oldText: 'older',
    },
    { className: 'MessageEntityUnknown', offset: 23, length: 1 },
    {
      className: 'MessageEntityFormattedDate',
      offset: 0,
      length: 4,
      date: 1900000000,
      shortTime: true,
    },
  ]);
  const kinds = tree.filter((n) => typeof n !== 'string').map((n) => n.kind);
  assert.ok(kinds.includes('bankcard'));
  assert.ok(kinds.includes('date'));
  assert.ok(kinds.includes('diff-insert'));
  assert.ok(kinds.includes('diff-delete'));
  assert.ok(kinds.includes('diff-replace'));
  assert.equal(kinds.length, 5, 'unknown stays plain text');
  const html = renderToStaticMarkup(
    React.createElement(MessageText, {
      text,
      entities: [
        { className: 'MessageEntityBankCard', offset: 5, length: 4 },
        {
          className: 'MessageEntityDiffReplace',
          offset: 10,
          length: 3,
          oldText: 'older',
        },
      ],
    })
  );
  assert.match(html, /data-bankcard="copy"/);
  assert.match(html, /msg-diff-replace/);
  assert.match(html, /title="older"/);
});

test('link previews name stories, sticker sets, themes and unique gifts', () => {
  assert.equal(
    webpageKindOf([{ className: 'WebPageAttributeStory' }]).badge,
    'story'
  );
  assert.equal(
    webpageKindOf([{ className: 'WebPageAttributeStickerSet', emojis: true }])
      .badge,
    'emojiSet'
  );
  assert.equal(
    webpageKindOf([{ className: 'WebPageAttributeStickerSet' }]).badge,
    'stickerSet'
  );
  assert.equal(
    webpageKindOf([{ className: 'WebPageAttributeTheme' }]).badge,
    'theme'
  );
  assert.deepEqual(
    webpageKindOf([
      {
        className: 'WebPageAttributeUniqueStarGift',
        gift: { title: 'Plush', num: 3 },
      },
    ]),
    { badge: 'uniqueGift', name: 'Plush #3' }
  );
  assert.equal(webpageKindOf(undefined), null);
});

test('a video stream media is a live-stream card', async () => {
  const { parseMedia } = await import('../src/web/message-parts.js');
  assert.deepEqual(
    parseMedia({
      media: { className: 'MessageMediaVideoStream', rtmpStream: true },
    }),
    { kind: 'live-stream', rtmp: true }
  );
});
