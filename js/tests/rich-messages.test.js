// Rich messages and layer 232 (R-Y220): Telegram's current schema adds a
// message made of page blocks. What it needs here — the schema switch (a
// real message#7600b9d3 decoded by GramJS), dialogs that name no peer
// (communities), the repair marker, the raw store form, the shaping of the
// blocks, the buttons, the service lines — all with synthetic data; GramJS
// only decodes bytes this test makes, offline.

import { test } from 'node:test';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LAYER,
  SCHEMA_REV,
  importTelegram,
  peerDialogs,
} from '../src/sources/telegram-layer.js';
import { rereadUnsupported } from '../src/sources/telegram-repair.js';
import { rawMessage } from '../src/sources/telegram-history.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import {
  richPlainText,
  shapeRich,
} from '../src/sources/telegram-instant-view-shape.js';
import { pictureOf } from '../src/sources/telegram-media.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { buttonOf, legacyButton } from '../src/web/bot-keyboard.js';
import { quoteRichText, richOf } from '../src/web/rich-message-model.js';
import { richServiceWords } from '../src/web/rich-service-model.js';
import { parseMessageParts } from '../src/web/message-parts.js';

const text = (s) => ({ className: 'TextPlain', text: s });

test('the schema is layer 232 and has the rich message', () => {
  assert.equal(LAYER, 232);
  const tl = readFileSync(
    new URL('../src/sources/telegram-api/layer-232.tl', import.meta.url),
    'utf8'
  );
  assert.match(tl, /^message#7600b9d3 /m);
  assert.match(tl, /^richMessage#baf39d8b /m);
  assert.match(tl, /^pageBlockThinking#/m);
  assert.match(tl, /^dialogCommunity#/m);
});

// A GramJS message with a rich message, written as bytes and read back.
const roundTrip = async (make) => {
  const { Api, helpers } = await importTelegram();
  const { BinaryReader } = createRequire(import.meta.url)(
    'teleproto/extensions'
  );
  const bytes = Buffer.from(make(Api, helpers).getBytes());
  return { Api, read: new BinaryReader(bytes).tgReadObject() };
};

test('GramJS decodes a message#7600b9d3 with a rich message', async () => {
  const { Api, read } = await roundTrip(
    (A) =>
      new A.Message({
        id: 7,
        peerId: new A.PeerChannel({ channelId: 1234n }),
        date: 1_760_000_000,
        message: '',
        guestchatViaFrom: new A.PeerUser({ userId: 9n }),
        richMessage: new A.RichMessage({
          part: true,
          blocks: [
            new A.PageBlockHeading2({ text: new A.TextPlain({ text: 'Hi' }) }),
            new A.PageBlockMath({ source: 'x^2' }),
            new A.PageBlockThinking({ text: new A.TextPlain({ text: 'hm' }) }),
            new A.PageBlockButtonRow({
              alignCenter: true,
              buttons: [
                new A.PageButton({
                  text: new A.TextPlain({ text: 'Go' }),
                  type: new A.InlineButtonTypeUrl({ url: 'https://a.test/' }),
                }),
              ],
            }),
          ],
          photos: [],
          documents: [],
        }),
      })
  );
  assert.equal(read.className, 'Message');
  assert.equal(read.richMessage.className, 'RichMessage');
  assert.equal(read.richMessage.part, true);
  assert.deepEqual(
    read.richMessage.blocks.map((b) => b.className),
    [
      'PageBlockHeading2',
      'PageBlockMath',
      'PageBlockThinking',
      'PageBlockButtonRow',
    ]
  );
  assert.ok(read instanceof Api.Message);
  // The raw store form keeps it, as plain JSON.
  const raw = rawMessage(read);
  assert.equal(raw.richMessage.blocks[1].source, 'x^2');
  assert.equal(raw.guestchatViaFrom.userId, '9');
  assert.equal(
    raw.richMessage.blocks[3].buttons[0].type.url,
    'https://a.test/'
  );
  assert.doesNotThrow(() => JSON.stringify(raw));
});

test('a dialog list with a community reads, the community left out', async () => {
  const { read } = await roundTrip((A) => {
    const settings = new A.PeerNotifySettings({});
    return new A.messages.Dialogs({
      dialogs: [
        new A.DialogCommunity({ communityId: 55n, notifySettings: settings }),
        new A.Dialog({
          peer: new A.PeerUser({ userId: 3n }),
          topMessage: 1,
          readInboxMaxId: 0,
          readOutboxMaxId: 0,
          unreadCount: 0,
          unreadMentionsCount: 0,
          unreadReactionsCount: 0,
          notifySettings: settings,
        }),
      ],
      messages: [],
      chats: [],
      users: [],
    });
  });
  assert.equal(read.dialogs.length, 1);
  assert.equal(read.dialogs[0].className, 'Dialog');
});

test('GramJS helpers testing for the old button classes do not throw', async () => {
  const { Api } = await importTelegram();
  assert.equal(
    new Api.KeyboardButtonSwitchInline() instanceof Api.KeyboardButtonUrl,
    false
  );
  const button = new Api.KeyboardInlineButton({
    text: 'x',
    type: new Api.InlineButtonTypeUrl({ url: 'https://a.test/' }),
  });
  assert.equal(button instanceof Api.KeyboardButtonSwitchInline, false);
});

test('peerDialogs keeps only dialogs that name a peer', () => {
  const kept = { peer: { userId: 1 } };
  assert.deepEqual(peerDialogs([{ communityId: 5 }, kept, null, undefined]), [
    kept,
  ]);
  assert.equal(peerDialogs(undefined), undefined);
});

test('the repair marker names the schema revision', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'msg:telegram:-5:1',
    source: 'telegram',
    chat: '-5',
    raw: { media: { className: 'MessageMediaUnsupported' } },
  });
  // The marker of an earlier trial at the same layer does not count.
  await store.put({ id: `repair:telegram:unsupported-layer-${LAYER}` });
  const asked = [];
  const refresh = async (request) => asked.push(request);
  assert.equal(
    await rereadUnsupported(store, {
      refresh,
      layer: LAYER,
      rev: SCHEMA_REV,
    }),
    1
  );
  assert.equal(asked.length, 1);
  assert.ok(
    await store.get(`repair:telegram:unsupported-layer-${LAYER}-r${SCHEMA_REV}`)
  );
  // Once done, it is not asked again at this revision.
  assert.equal(
    await rereadUnsupported(store, { refresh, layer: LAYER, rev: SCHEMA_REV }),
    0
  );
  // A later revision asks again.
  assert.equal(
    await rereadUnsupported(store, {
      refresh,
      layer: LAYER,
      rev: SCHEMA_REV + 1,
    }),
    1
  );
});

const deep = (depth) =>
  depth === 0
    ? { className: 'TextPlain', text: 'bottom' }
    : { className: 'TextBold', text: deep(depth - 1) };

test('the raw form keeps a deep rich message and drops picture bytes', () => {
  const raw = rawMessage({
    id: 1,
    message: '',
    richMessage: {
      className: 'RichMessage',
      blocks: [{ className: 'PageBlockParagraph', text: deep(15) }],
      photos: [
        {
          className: 'Photo',
          id: 5n,
          sizes: [
            {
              className: 'PhotoStrippedSize',
              type: 'i',
              bytes: Buffer.from('abc'),
            },
            { className: 'PhotoSize', type: 'x', w: 1, h: 1, size: 3 },
          ],
        },
      ],
      documents: [],
    },
  });
  let text = raw.richMessage.blocks[0].text;
  let levels = 0;
  while (text.className === 'TextBold') {
    text = text.text;
    levels += 1;
  }
  assert.equal(levels, 15);
  assert.equal(text.text, 'bottom');
  assert.equal(raw.richMessage.photos[0].sizes[0].bytes, undefined);
  assert.equal(raw.richMessage.photos[0].sizes[1].type, 'x');
});

test('a rich message with no text is stored, with its words as the body', () => {
  const [link] = telegramDialogLinks(
    { id: '-1005', isChannel: true, isGroup: true, title: 'G' },
    [
      {
        id: 3,
        message: '',
        date: 1_760_000_000,
        media: null,
        fromId: { className: 'PeerUser', userId: '9' },
        richMessage: {
          className: 'RichMessage',
          blocks: [
            { className: 'PageBlockHeading1', text: text('Title') },
            { className: 'PageBlockParagraph', text: text('Words') },
          ],
        },
      },
    ]
  );
  assert.equal(link.body, 'Title\nWords');
  assert.ok(link.raw.richMessage);
});

const sample = {
  className: 'RichMessage',
  rtl: true,
  part: true,
  blocks: [
    { className: 'PageBlockHeading3', text: text('Head') },
    { className: 'PageBlockThinking', text: text('pondering') },
    { className: 'PageBlockMath', source: '\\frac{a}{b}' },
    {
      className: 'PageBlockList',
      items: [
        {
          className: 'PageListItemText',
          checkbox: true,
          checked: true,
          text: text('done'),
        },
        { className: 'PageListItemText', text: text('plain') },
      ],
    },
    {
      className: 'PageBlockOrderedList',
      start: 3,
      reversed: true,
      items: [
        { className: 'PageListOrderedItemText', value: 3, text: text('three') },
      ],
    },
    {
      className: 'PageBlockBlockquoteBlocks',
      blocks: [{ className: 'PageBlockParagraph', text: text('inner') }],
      caption: text('by'),
    },
    {
      className: 'PageBlockButtonRow',
      alignRight: true,
      buttons: [
        {
          text: text('Visit'),
          type: { className: 'InlineButtonTypeUrl', url: 'https://x.test/' },
          style: { bgDanger: true },
        },
      ],
    },
    {
      className: 'PageBlockDocument',
      documentId: '9',
      caption: { text: text('c') },
    },
    {
      className: 'PageBlockHeading6',
      text: { className: 'TextMath', source: 'e^x' },
    },
    { className: 'PageBlockUnsupported' },
  ],
  photos: [],
  documents: [
    {
      id: '9',
      mimeType: 'text/plain',
      size: 12,
      attributes: [
        { className: 'DocumentAttributeFilename', fileName: 'n.txt' },
      ],
    },
  ],
};

test('rich blocks are shaped like an Instant View page, plus the new ones', () => {
  const shaped = shapeRich(sample);
  assert.equal(shaped.rtl, true);
  assert.equal(shaped.part, true);
  const [head, thinking, math, list, ordered, quote, buttons, file, h6] =
    shaped.blocks;
  assert.equal(shaped.blocks.length, 9, 'the unsupported block is dropped');
  assert.equal(head.k, 'h3');
  assert.equal(thinking.k, 'thinking');
  assert.deepEqual(math, { k: 'math', source: '\\frac{a}{b}' });
  assert.deepEqual(
    list.items.map((i) => i.check),
    [true, undefined]
  );
  assert.equal(ordered.start, 3);
  assert.equal(ordered.reversed, true);
  assert.equal(ordered.items[0].num, '3');
  assert.equal(quote.k, 'quoteblocks');
  assert.equal(quote.blocks[0].k, 'p');
  assert.equal(buttons.align, 'right');
  assert.equal(buttons.buttons[0].type.url, 'https://x.test/');
  assert.equal(buttons.buttons[0].style.bgDanger, true);
  assert.equal(file.name, 'n.txt');
  assert.equal(file.size, 12);
  assert.deepEqual(shaped.documents, ['9']);
  assert.deepEqual(h6.c, [{ t: 'math', s: 'e^x' }]);
});

test('a rich message becomes plain words for the list and search', () => {
  assert.equal(
    richPlainText(sample),
    'Head\npondering\n\\frac{a}{b}\ndone\nplain\nthree\ninner\nby\nVisit\nc\ne^x'
  );
  assert.equal(richPlainText({ blocks: [] }), '');
});

test('a button of a rich message acts like an inline keyboard button', () => {
  const url = buttonOf({
    text: 'Visit',
    style: { bgDanger: true },
    type: { className: 'InlineButtonTypeUrl', url: 'https://x.test/' },
  });
  assert.deepEqual(
    { kind: url.kind, text: url.text, url: url.url, tone: url.tone },
    { kind: 'url', text: 'Visit', url: 'https://x.test/', tone: 'danger' }
  );
  const callback = buttonOf({
    text: 'Ask',
    type: {
      className: 'InlineButtonTypeCallback',
      data: { bytes: 'YQ==' },
      requiresPassword: true,
    },
  });
  assert.equal(callback.kind, 'callback');
  assert.equal(callback.data, 'YQ==');
  assert.equal(callback.password, true);
  // A reply keyboard's plain button, and an older stored class.
  assert.equal(
    buttonOf({ text: 'a', type: { className: 'ButtonTypeDefault' } }).kind,
    'text'
  );
  assert.equal(
    buttonOf({
      className: 'KeyboardButtonUrl',
      text: 'o',
      url: 'https://o.test/',
    }).kind,
    'url'
  );
  assert.equal(
    buttonOf({ text: 'x', type: { className: 'InlineButtonTypeDisabled' } }),
    null
  );
  assert.equal(
    legacyButton({ text: 't', type: { className: 'InlineButtonTypeGame' } })
      .className,
    'KeyboardButtonGame'
  );
});

test('the parts of a rich message: blocks, no text, a rich quote', () => {
  const link = {
    id: 'msg:telegram:-5:4',
    source: 'telegram',
    chat: '-5',
    body: 'Head\nWords',
    raw: {
      id: 4,
      richMessage: sample,
      replyTo: { replyToMsgId: 2, quoteRich: [text('quoted '), text('words')] },
    },
  };
  const parts = parseMessageParts(link);
  assert.equal(parts.rich, sample);
  assert.equal(parts.text, '');
  assert.equal(parts.replyRef.quoteText, 'quoted words');
  assert.equal(richOf({}), null);
  assert.equal(quoteRichText({}), '');
  assert.equal(parseMessageParts({ ...link, raw: { id: 4 } }).rich, null);
});

test('the new service actions have lines', () => {
  assert.equal(
    richServiceWords('MessageActionChangeCommunity', { communityId: '5' }).key,
    'chat.service.communityIn'
  );
  assert.equal(
    richServiceWords('MessageActionChangeCommunity', {}).key,
    'chat.service.communityOut'
  );
  assert.equal(
    richServiceWords('MessageActionChatJoinedViaCommunity', {}).key,
    'chat.service.communityJoined'
  );
  assert.deepEqual(
    richServiceWords('MessageActionGramTransfer', {
      amount: '12',
      comment: 'hi',
    }),
    {
      key: 'chat.service.gramTransferNote',
      params: { amount: 12, note: 'hi' },
    }
  );
  assert.equal(
    richServiceWords('MessageActionWalletTonConnectRequest', { declined: true })
      .key,
    'chat.service.walletConnectDeclined'
  );
  assert.equal(
    richServiceWords('MessageActionNoPaidMessagesTokenUsed', {}).key,
    'chat.service.noPaidToken'
  );
  assert.equal(richServiceWords('MessageActionPinMessage', {}), null);
  const parts = parseMessageParts({
    id: 'msg:telegram:-5:6',
    source: 'telegram',
    chat: '-5',
    service: 'MessageActionChatJoinedViaCommunity',
    raw: {
      id: 6,
      action: { className: 'MessageActionChatJoinedViaCommunity' },
    },
  });
  assert.equal(parts.service.key, 'chat.service.communityJoined');
});

test('a picture of a rich message is found by its kind and id', () => {
  const raw = {
    richMessage: {
      photos: [
        { id: '55', sizes: [{ className: 'PhotoSize', type: 'x', size: 10 }] },
      ],
      documents: [
        {
          id: '77',
          mimeType: 'image/png',
          size: 100,
          thumbs: [],
        },
      ],
    },
  };
  assert.equal(pictureOf(raw, 'x', 0, 'photo:55').thumb, 'x');
  assert.equal(pictureOf(raw, 'x', 0, 'document:77').kind, 'document');
  assert.equal(pictureOf(raw, 'x', 0, 'photo:99'), null);
  assert.equal(pictureOf(raw, 'x', 0, 'nonsense'), null);
});
