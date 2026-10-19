import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  telegramUpdatesToLinks,
  telegramReactionsFromUpdate,
  createTelegramBotLive,
} from '../src/sources/telegram.js';

const baseMsg = (overrides = {}) => ({
  message_id: 42,
  date: 1700000000,
  chat: { id: 100, type: 'private' },
  from: { id: 1, first_name: 'Alice' },
  ...overrides,
});

const makeUpdate = (msgOverrides = {}) => ({
  update_id: 1,
  message: baseMsg(msgOverrides),
});

const makeFakeFetch = () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : {};
    calls.push({ url, body });
    return { ok: true, json: async () => ({ ok: true, result: true }) };
  };
  return { fetchImpl, calls };
};

describe('telegramUpdatesToLinks — attachments', () => {
  test('photo produces attachments[0].kind === photo', () => {
    const updates = [
      makeUpdate({
        photo: [
          { file_id: 'a', width: 100, height: 100, file_size: 1000 },
          { file_id: 'b', width: 800, height: 600, file_size: 50000 },
        ],
      }),
    ];
    const [link] = telegramUpdatesToLinks(updates);
    assert.equal(link.attachments[0].kind, 'photo');
  });

  test('voice produces attachments[0].kind === voice', () => {
    const [link] = telegramUpdatesToLinks([
      makeUpdate({ voice: { duration: 5, mime_type: 'audio/ogg' } }),
    ]);
    assert.equal(link.attachments[0].kind, 'voice');
  });

  test('document produces attachments[0].kind === file', () => {
    const [link] = telegramUpdatesToLinks([
      makeUpdate({
        document: {
          file_id: 'abc',
          file_name: 'report.pdf',
          mime_type: 'application/pdf',
          file_size: 2048,
        },
      }),
    ]);
    assert.equal(link.attachments[0].kind, 'file');
  });

  test('location produces attachments[0].kind === location', () => {
    const [link] = telegramUpdatesToLinks([
      makeUpdate({ location: { latitude: 55.7, longitude: 37.6 } }),
    ]);
    assert.equal(link.attachments[0].kind, 'location');
  });

  test('poll produces attachments[0].kind === poll', () => {
    const [link] = telegramUpdatesToLinks([
      makeUpdate({ poll: { question: 'Favorite color?' } }),
    ]);
    assert.equal(link.attachments[0].kind, 'poll');
  });
});

describe('telegramUpdatesToLinks — sender and forward fields', () => {
  test('senderName built from message.from first + last name', () => {
    const [link] = telegramUpdatesToLinks([
      makeUpdate({
        from: { id: 1, first_name: 'Alice', last_name: 'Smith' },
        text: 'hi',
      }),
    ]);
    assert.equal(link.senderName, 'Alice Smith');
  });

  test('forward_origin type user produces forwardedFrom.id', () => {
    const [link] = telegramUpdatesToLinks([
      makeUpdate({
        text: 'forwarded',
        forward_origin: {
          type: 'user',
          sender_user: { id: 99, first_name: 'Bob', last_name: 'Jones' },
        },
      }),
    ]);
    assert.equal(link.forwardedFrom.id, '99');
  });

  test('forward_from fallback produces forwardedFrom.id', () => {
    const [link] = telegramUpdatesToLinks([
      makeUpdate({
        text: 'forwarded',
        forward_from: { id: 77, first_name: 'Carol' },
      }),
    ]);
    assert.equal(link.forwardedFrom.id, '77');
  });
});

describe('telegramUpdatesToLinks — edited', () => {
  test('edited_message update produces edited ISO string', () => {
    const [link] = telegramUpdatesToLinks([
      {
        update_id: 2,
        edited_message: {
          message_id: 10,
          date: 1700000000,
          edit_date: 1700000100,
          chat: { id: 100, type: 'private' },
          text: 'edited text',
        },
      },
    ]);
    assert.ok(link.edited, 'edited field should be set');
    assert.ok(link.edited.endsWith('Z'), 'edited should be ISO string');
  });
});

describe('telegramReactionsFromUpdate', () => {
  test('returns correct structure for message_reaction update', () => {
    const update = {
      update_id: 10,
      message_reaction: {
        message_id: 42,
        chat: { id: 100 },
        new_reaction: [{ type: 'emoji', emoji: '👍' }],
      },
    };
    const result = telegramReactionsFromUpdate(update);
    assert.equal(result.messageId, '42');
    assert.equal(result.chat, '100');
    assert.equal(result.reactions[0].emoji, '👍');
    assert.equal(result.reactions[0].count, 1);
  });

  test('returns null when no message_reaction', () => {
    assert.equal(telegramReactionsFromUpdate({ update_id: 1 }), null);
    assert.equal(telegramReactionsFromUpdate(null), null);
  });
});

describe('telegramUpdatesToLinks — message_reaction skipped', () => {
  test('skips message_reaction updates, produces no links', () => {
    const updates = [
      {
        update_id: 10,
        message_reaction: {
          message_id: 42,
          chat: { id: 100 },
          new_reaction: [{ type: 'emoji', emoji: '👍' }],
        },
      },
    ];
    const links = telegramUpdatesToLinks(updates);
    assert.equal(links.length, 0);
  });
});

describe('createTelegramBotLive — action methods', () => {
  test('editMessage calls editMessageText with correct params', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const bot = createTelegramBotLive({ token: 'tok', fetchImpl });
    await bot.editMessage({ chat: '100', id: '42', text: 'new text' });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('editMessageText'));
    assert.equal(calls[0].body.chat_id, '100');
    assert.equal(calls[0].body.message_id, 42);
    assert.equal(calls[0].body.text, 'new text');
  });

  test('deleteMessages calls deleteMessages with correct params', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const bot = createTelegramBotLive({ token: 'tok', fetchImpl });
    await bot.deleteMessages({ chat: '100', ids: [1, 2, 3] });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('deleteMessages'));
    assert.equal(calls[0].body.chat_id, '100');
    assert.deepEqual(calls[0].body.message_ids, [1, 2, 3]);
  });

  test('react calls setMessageReaction with emoji in reaction array', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const bot = createTelegramBotLive({ token: 'tok', fetchImpl });
    await bot.react({ chat: '100', id: '42', emoji: '👍' });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('setMessageReaction'));
    assert.deepEqual(calls[0].body.reaction, [{ type: 'emoji', emoji: '👍' }]);
  });

  test('react with empty string sends empty reaction array', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const bot = createTelegramBotLive({ token: 'tok', fetchImpl });
    await bot.react({ chat: '100', id: '42', emoji: '' });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('setMessageReaction'));
    assert.deepEqual(calls[0].body.reaction, []);
  });

  test('forwardMessages calls forwardMessages with correct params', async () => {
    const { fetchImpl, calls } = makeFakeFetch();
    const bot = createTelegramBotLive({ token: 'tok', fetchImpl });
    await bot.forwardMessages({ fromChat: '100', ids: [1, 2], toChat: '200' });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('forwardMessages'));
    assert.equal(calls[0].body.from_chat_id, '100');
    assert.equal(calls[0].body.chat_id, '200');
    assert.deepEqual(calls[0].body.message_ids, [1, 2]);
  });
});
