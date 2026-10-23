// Text formatting (R-Y101): what is typed with Telegram Desktop's
// markdown goes as Telegram's formatting — bold, italic, strike, spoiler,
// code, code blocks and links — in messages, long messages' parts,
// edits and captions; it shows formatted at once; editing a formatted
// message keeps it; the composer's shortcuts wrap the selection. Fake
// clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLASS_OF,
  apiEntities,
  parseFormatted,
  toMarkdown,
  wrapSelection,
} from '../src/sources/telegram-format.js';
import {
  formattedParts,
  sendText,
  splitMessage,
} from '../src/sources/telegram-send.js';
import { createActions } from '../src/sources/telegram-actions.js';
import { importTelegram } from '../src/sources/telegram-layer.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { chatMessages } from '../src/web/chat-model.js';
import { formatEdit, formatOfKey } from '../src/web/text-shortcuts.js';

const parsed = (typed) => {
  const { text, entities } = parseFormatted(typed);
  return [text, entities.map((e) => [e.type, e.offset, e.length])];
};

test('Desktop markdown becomes formatting; markers go (R-Y101)', () => {
  assert.deepEqual(parsed('**bold** and __it__'), [
    'bold and it',
    [
      ['bold', 0, 4],
      ['italic', 9, 2],
    ],
  ]);
  assert.deepEqual(parsed('||secret|| ~~gone~~ `x = 1`'), [
    'secret gone x = 1',
    [
      ['spoiler', 0, 6],
      ['strike', 7, 4],
      ['code', 12, 5],
    ],
  ]);
  // Nested, and offsets in UTF-16 units (an emoji counts two).
  assert.deepEqual(parsed('😀 **a __b__ c**'), [
    '😀 a b c',
    [
      ['bold', 3, 5],
      ['italic', 5, 1],
    ],
  ]);
  const block = parseFormatted('look:\n```js\nconst a = 1;\n```');
  assert.equal(block.text, 'look:\nconst a = 1;');
  assert.deepEqual(block.entities, [
    { type: 'pre', offset: 6, length: 12, language: 'js' },
  ]);
  const link = parseFormatted('see [the docs](example.com/x) now');
  assert.equal(link.text, 'see the docs now');
  assert.deepEqual(link.entities, [
    { type: 'link', offset: 4, length: 8, url: 'https://example.com/x' },
  ]);
});

test('<u>underline</u>, as Ctrl+U makes it in Desktop', () => {
  assert.deepEqual(parseFormatted('a <u>line</u>here'), {
    text: 'a linehere',
    entities: [{ type: 'underline', offset: 2, length: 4 }],
  });
  assert.deepEqual(
    parseFormatted('<u>**x**</u>')
      .entities.map((e) => e.type)
      .sort(),
    ['bold', 'underline']
  );
  for (const typed of ['<u> x</u>', '<u></u>', '<u>open', 'a <b>b</b>']) {
    assert.equal(parseFormatted(typed).text, typed, typed);
  }
});

test('what is not markdown stays as typed (R-Y101)', () => {
  for (const typed of [
    'a *lone* _one_',
    '2**3**4',
    'snake__case__name',
    '** not bold**',
    '**not bold **',
    'a ` lone tick',
    '[x](javascript:alert(1))',
    '****',
  ]) {
    assert.deepEqual(parsed(typed), [typed, []], typed);
  }
  // Nothing is parsed inside code.
  assert.deepEqual(parsed('`a **b**`'), ['a **b**', [['code', 0, 7]]]);
});

test('every formatting is a class GramJS has (R-Y101)', async () => {
  const { Api } = await importTelegram();
  for (const name of Object.values(CLASS_OF)) {
    assert.equal(typeof Api[name], 'function', name);
  }
  const [bold, pre] = apiEntities(Api, [
    { type: 'bold', offset: 0, length: 2 },
    { type: 'pre', offset: 3, length: 4 },
  ]);
  assert.ok(bold instanceof Api.MessageEntityBold);
  assert.equal(pre.language, '');
});

test('a long formatted message: each part keeps its own formatting (R-Y101)', () => {
  const typed = `**${'a'.repeat(30)} ${'b'.repeat(30)}** tail`;
  const parts = formattedParts(typed, 40);
  assert.deepEqual(
    parts.map((p) => p.text),
    splitMessage(parseFormatted(typed).text, 40)
  );
  assert.deepEqual(
    parts.map((p) => p.entities),
    [
      [{ type: 'bold', offset: 0, length: 30 }],
      [{ type: 'bold', offset: 0, length: 30 }],
    ]
  );
});

class Fake {
  constructor(args) {
    Object.assign(this, args);
  }
}
const FakeApi = {
  messages: { SendMessage: Fake, EditMessage: Fake },
  ...Object.fromEntries(
    Object.values(CLASS_OF).map((name) => [
      name,
      class extends Fake {
        className = name;
      },
    ])
  ),
};

test('a message goes as text plus entities, once (R-Y101)', async () => {
  const requests = [];
  const client = {
    getInputEntity: async (peer) => ({ peer }),
    invoke: async (request) => {
      requests.push(request);
      return { className: 'UpdateShortSentMessage', id: 9, date: 1 };
    },
  };
  const sent = await sendText({
    client,
    Api: FakeApi,
    helpers: { readBigIntFromBuffer: (b) => b.toString('hex') },
    peer: '42',
    text: 'hi **there**',
    clientId: 'c1',
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].message, 'hi there');
  assert.deepEqual(
    requests[0].entities.map((e) => [e.className, e.offset, e.length]),
    [['MessageEntityBold', 3, 5]]
  );
  assert.equal(sent[0].text, 'hi there');
});

test('an edit is formatted as a new message is (R-Y101)', async () => {
  const requests = [];
  const client = {
    invoke: async (request) => {
      requests.push(request);
      return { updates: [] };
    },
  };
  const store = createMemoryStore();
  const actions = createActions(
    {
      store,
      importer: async () => ({ Api: FakeApi }),
      log: () => {},
      queue: { run: (_key, _priority, task) => task() },
      connection: {
        open: async () => ({ client }),
        withPeer: (_client, chat, use) => use(`peer:${chat}`),
      },
      live: { handle: async () => {} },
      catchUp: { observeResult: () => {} },
    },
    { credentials: async () => ({ kind: 'user' }) }
  );
  const answer = await actions.editMessage({
    chat: '42',
    id: 7,
    text: '~~old~~ new',
  });
  assert.equal(answer.ok, true);
  assert.equal(requests[0].message, 'old new');
  assert.deepEqual(
    requests[0].entities.map((e) => [e.className, e.offset, e.length]),
    [['MessageEntityStrike', 0, 3]]
  );
});

test('a message on its way shows formatted; others as typed (R-Y101)', () => {
  const item = (source, text) => ({
    key: `${source}:42`,
    clientId: `c-${source}`,
    source,
    chat: '42',
    text,
    at: '2026-10-22T10:00:00.000Z',
    status: 'sending',
  });
  const [mine] = chatMessages([], 'telegram:42', {
    pending: [item('telegram', '**hi**')],
  });
  assert.equal(mine.body, 'hi');
  assert.deepEqual(mine.raw.entities, [
    { className: 'MessageEntityBold', offset: 0, length: 2 },
  ]);
  const [other] = chatMessages([], 'whatsapp:42', {
    pending: [item('whatsapp', '**hi**')],
  });
  assert.equal(other.body, '**hi**');
});

test('editing a formatted message gives its markdown back (R-Y101)', () => {
  for (const typed of [
    '**bold** and __it__',
    '**a __b__ c**',
    'see [docs](https://example.com) ||now||',
    '```py\nprint(1)\n```',
    '<u>under</u> and **<u>both</u> too**',
  ]) {
    const { text, entities } = parseFormatted(typed);
    assert.equal(toMarkdown(text, entities), typed);
  }
  // As Telegram stores them (by class name); what markdown cannot say
  // (a quote) is left out.
  assert.equal(
    toMarkdown('ab cd ef', [
      { className: 'MessageEntityItalic', offset: 0, length: 2 },
      { className: 'MessageEntityUnderline', offset: 3, length: 2 },
      { className: 'MessageEntityBlockquote', offset: 6, length: 2 },
    ]),
    '__ab__ <u>cd</u> ef'
  );
});

test('shortcuts wrap the selection, again unwrap it, in any layout (R-Y101)', () => {
  assert.deepEqual(wrapSelection('hello world ', 6, 12, 'bold'), {
    from: 6,
    to: 11,
    insert: '**world**',
    select: [8, 13],
  });
  assert.deepEqual(wrapSelection('hello **world**', 8, 13, 'bold'), {
    from: 6,
    to: 15,
    insert: 'world',
    select: [6, 11],
  });
  // Nothing selected: the caret between the markers.
  assert.deepEqual(wrapSelection('a ', 2, 2, 'code').select, [3, 3]);
  // A link: the caret where its address goes.
  assert.deepEqual(wrapSelection('docs', 0, 4, 'link'), {
    from: 0,
    to: 4,
    insert: '[docs]()',
    select: [7, 7],
  });
  assert.equal(
    formatEdit('**a** ~~b~~', 0, 11, 'plain').insert,
    'a b',
    'plain text takes the formatting off'
  );
  const key = (code, extra = {}) =>
    formatOfKey({ code, ctrlKey: true, ...extra });
  assert.equal(key('KeyB'), 'bold');
  // A Russian layout's "и" is the B key.
  assert.equal(formatOfKey({ code: 'KeyB', key: 'и', metaKey: true }), 'bold');
  assert.equal(key('KeyX', { shiftKey: true }), 'strike');
  assert.equal(key('KeyM', { shiftKey: true }), 'code');
  assert.equal(key('KeyP', { shiftKey: true }), 'spoiler');
  assert.equal(key('KeyK'), 'link');
  assert.equal(key('KeyU'), 'underline');
  assert.deepEqual(wrapSelection('a b', 2, 3, 'underline'), {
    from: 2,
    to: 3,
    insert: '<u>b</u>',
    select: [5, 6],
  });
  assert.equal(wrapSelection('a <u>b</u>', 5, 6, 'underline').insert, 'b');
  assert.equal(key('KeyX'), null, 'Ctrl+X still cuts');
  assert.equal(formatOfKey({ code: 'KeyB' }), null);
});
