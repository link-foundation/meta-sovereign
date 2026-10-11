import { describe, it, expect } from 'test-anywhere';

import {
  GREETING_SELECTION_ID,
  builtInGreetingStickers,
  defaultGreetingSelection,
  detectGreetingLanguage,
  greetingCatalogue,
  greetingLinkId,
  greetingNetworks,
  isGreetingMessage,
  isGreetingText,
  listLiveGreetingStickers,
  loadGreetingCredentials,
  loadGreetingSelection,
  normalizeGreetingSelection,
  planGreetings,
  runGreetings,
  saveGreetingSelection,
  summarizeChats,
  telegramDefaultGreetings,
  telegramGreetingSets,
  vkGreetingStickers,
  vkStickerPreview,
} from '../src/greetings/index.js';
import { createMemoryStore } from '../src/storage/index.js';
import { contentSticker } from '../src/sources/sticker.js';
import { buildMessageLink } from '../src/sources/link.js';
import { createVkLive, vkSource } from '../src/sources/vk.js';
import {
  createTelegramBotLive,
  telegramSource,
  telegramUpdatesToLinks,
} from '../src/sources/telegram.js';
import { createWhatsAppCloudLive } from '../src/sources/whatsapp.js';
import { createFacebookLive } from '../src/sources/facebook.js';

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  statusText: 'OK',
  headers: new Map([['Content-Type', 'application/json']]),
  async json() {
    return body;
  },
  async text() {
    return JSON.stringify(body);
  },
});

/** Records every request and answers with the next queued body. */
const mockFetch = (...bodies) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const raw = init.body;
    let body = null;
    if (raw instanceof URLSearchParams) {
      body = Object.fromEntries(raw.entries());
    } else if (typeof raw === 'string') {
      body = JSON.parse(raw);
    }
    calls.push({ url: new URL(String(url)), init, body });
    const next = bodies.shift();
    if (next === undefined) {
      throw new Error(`unexpected fetch ${url}`);
    }
    return typeof next === 'function' ? next() : jsonResponse(next);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

const rejection = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err.message;
  }
  return null;
};

/** `when` is a timestamp, or `{timestamp, sticker}` for sticker messages. */
const msg = (source, id, chat, sender, body, when) =>
  buildMessageLink({
    source,
    externalId: id,
    sender,
    chat,
    body,
    ...(typeof when === 'object' ? when : { timestamp: when }),
  });

const NOW = Date.parse('2026-10-11T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();

describe('greeting detection', () => {
  it('recognises whole-message greetings in every supported language', () => {
    expect(detectGreetingLanguage('Привет!')).toBe('ru');
    expect(detectGreetingLanguage('Добрый вечер')).toBe('ru');
    expect(detectGreetingLanguage('здравствуйте, вам')).toBe('ru');
    expect(detectGreetingLanguage('Hello there!')).toBe('en');
    expect(detectGreetingLanguage('good morning everyone')).toBe('en');
    expect(detectGreetingLanguage('你好')).toBe('zh');
    expect(detectGreetingLanguage('नमस्ते जी')).toBe('hi');
    expect(detectGreetingLanguage('Xin chào bạn')).toBe('vi');
    expect(detectGreetingLanguage('👋')).toBe('und');
  });

  it('does not treat questions, words that merely start with "hi", or other emoji as greetings', () => {
    expect(isGreetingText('Привет, как дела?')).toBe(false);
    expect(isGreetingText('hi, can you review my PR?')).toBe(false);
    expect(isGreetingText('history')).toBe(false);
    expect(isGreetingText('🙂')).toBe(false);
    expect(isGreetingText('')).toBe(false);
    expect(isGreetingText(null)).toBe(false);
  });

  it('recognises greeting stickers by catalogue id or by their emoji', () => {
    const ids = new Set(['72789']);
    expect(isGreetingMessage({ body: '', sticker: { id: '72789' } }, ids)).toBe(
      true
    );
    expect(isGreetingMessage({ body: '', sticker: { emoji: '👋' } })).toBe(
      true
    );
    expect(isGreetingMessage({ body: '', sticker: { id: '1' } }, ids)).toBe(
      false
    );
    expect(isGreetingMessage({ body: 'hey' })).toBe(true);
  });
});

describe('greeting catalogue', () => {
  it('references every VK sticker by id plus a vk.com preview link, never bundled art', () => {
    expect(vkGreetingStickers.length).toBeGreaterThan(20);
    for (const sticker of vkGreetingStickers) {
      expect(sticker.network).toBe('vk');
      expect(sticker.id).toMatch(/^\d+$/);
      expect(sticker.previewUrl).toBe(
        `https://vk.com/sticker/1-${sticker.id}-512`
      );
    }
    expect(vkStickerPreview('21', { background: true })).toBe(
      'https://vk.com/sticker/1-21-512b'
    );
    const ids = vkGreetingStickers.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists Telegram sets by name and documents the empty-chat defaults as user-API only', () => {
    expect(telegramGreetingSets.length).toBeGreaterThan(0);
    for (const set of telegramGreetingSets) {
      expect(set.addUrl).toBe(`https://t.me/addstickers/${set.name}`);
    }
    expect(telegramDefaultGreetings.method).toBe('messages.getStickers');
    expect(telegramDefaultGreetings.emoticon).toBe('👋⭐️');
    expect(telegramDefaultGreetings.botApi).toBe(false);
  });

  it('describes what every network can send to open a dialog', () => {
    for (const network of ['vk', 'telegram', 'whatsapp', 'facebook', 'x']) {
      expect(greetingNetworks[network]).toBeTruthy();
    }
    expect(greetingNetworks.x.sticker).toBeNull();
    expect(greetingNetworks.telegram.initiate).toBe('reply-only');
    expect(greetingNetworks.whatsapp.windowHours).toBe(24);
    const catalogue = greetingCatalogue();
    expect(catalogue.stickers.vk.length).toBe(vkGreetingStickers.length);
    expect(catalogue.texts.ru).toContain('Привет!');
  });
});

describe('sticker content and message links', () => {
  it('reads stickers from ids, objects and links', () => {
    expect(contentSticker('hi')).toBeNull();
    expect(contentSticker({ text: 'hi' })).toBeNull();
    expect(contentSticker({ sticker: 21 })).toEqual({ id: '21', url: null });
    expect(
      contentSticker({ sticker: { url: 'https://example.test/a.webp' } })
    ).toEqual({ id: null, url: 'https://example.test/a.webp' });
  });

  it('keeps the sticker on message links only when there is one', () => {
    const plain = msg('vk', '1', '5', '5', 'hi');
    expect('sticker' in plain).toBe(false);
    const sticker = msg('vk', '2', '5', '5', '', {
      sticker: { id: '21', pack: '1' },
    });
    expect(sticker.sticker).toEqual({ id: '21', pack: '1' });
  });
});

describe('VK greeting stickers', () => {
  it('sends a sticker through messages.send with sticker_id', async () => {
    const fetchImpl = mockFetch({ response: 777 });
    const live = createVkLive({ fetchImpl, baseUrl: 'https://vk.test' });
    const result = await live.post(
      { chat: '42', sticker: { id: '72789' } },
      { token: 'vk-token', randomId: 9 }
    );
    expect(result).toBe(777);
    const [call] = fetchImpl.calls;
    expect(call.url.pathname).toBe('/method/messages.send');
    expect(call.body.peer_id).toBe('42');
    expect(call.body.sticker_id).toBe('72789');
    expect(call.body.random_id).toBe('9');
    expect('message' in call.body).toBe(false);
  });

  it('still requires either text or a sticker', async () => {
    const live = createVkLive({ fetchImpl: mockFetch() });
    expect(await rejection(live.post({ chat: '42' }, { token: 't' }))).toBe(
      'vk post message text or sticker is required'
    );
  });

  it('lists greeting stickers through store.getStickersKeywords', async () => {
    const fetchImpl = mockFetch({
      response: {
        dictionary: [
          {
            words: ['привет', 'hi'],
            user_stickers: [
              {
                sticker_id: 21,
                product_id: 1,
                is_allowed: true,
                images: [
                  { url: 'https://vk.test/21-128.png', width: 128 },
                  { url: 'https://vk.test/21-512.png', width: 512 },
                ],
              },
            ],
            promoted_stickers: [
              { sticker_id: 72789, product_id: 1536, is_allowed: false },
            ],
          },
          {
            words: ['пока'],
            user_stickers: [{ sticker_id: 99, product_id: 2 }],
          },
        ],
      },
    });
    const live = createVkLive({ fetchImpl, baseUrl: 'https://vk.test' });
    const { stickers, failures } = await live.listGreetingStickers({
      token: 'vk-token',
    });
    expect(fetchImpl.calls[0].url.pathname).toBe(
      '/method/store.getStickersKeywords'
    );
    expect(fetchImpl.calls[0].body.need_stickers).toBe('1');
    expect(failures).toEqual([]);
    expect(stickers.map((s) => s.id)).toEqual(['21', '72789']);
    expect(stickers[0].owned).toBe(true);
    expect(stickers[0].previewUrl).toBe('https://vk.test/21-512.png');
    expect(stickers[1].owned).toBe(false);
    expect(stickers[1].previewUrl).toBe('https://vk.com/sticker/1-72789-512');
  });

  it('keeps stickers from VK archives so incoming greetings are recognised', async () => {
    const links = await vkSource.parseArchive({
      conversations: [
        {
          peer: { id: 5 },
          messages: [
            {
              id: 1,
              from_id: 5,
              text: '',
              date: 1,
              attachments: [
                {
                  type: 'sticker',
                  sticker: { sticker_id: 72789, product_id: 1536 },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(links[0].sticker).toEqual({ id: '72789', pack: '1536' });
  });
});

describe('Telegram greeting stickers', () => {
  it('sends sticker content through sendSticker and text through sendMessage', async () => {
    const fetchImpl = mockFetch(
      { ok: true, result: { message_id: 1, chat: { id: 7 } } },
      { ok: true, result: { message_id: 2, chat: { id: 7 } } }
    );
    const live = createTelegramBotLive({
      fetchImpl,
      baseUrl: 'https://tg.test',
    });
    await live.post(
      { chat: '7', sticker: { id: 'FILE_ID' } },
      { token: 'bot-token' }
    );
    await live.post({ chat: '7', text: 'Hi!' }, { token: 'bot-token' });
    expect(fetchImpl.calls[0].url.pathname).toBe('/botbot-token/sendSticker');
    expect(fetchImpl.calls[0].body).toEqual({
      chat_id: '7',
      sticker: 'FILE_ID',
    });
    expect(fetchImpl.calls[1].url.pathname).toBe('/botbot-token/sendMessage');
    expect(fetchImpl.calls[1].body.text).toBe('Hi!');
  });

  it('lists only the waving stickers of each set and reports missing sets', async () => {
    const fetchImpl = mockFetch(
      {
        ok: true,
        result: {
          name: 'UtyaDuck',
          title: 'Utya',
          stickers: [
            {
              file_id: 'A',
              file_unique_id: 'ua',
              emoji: '👋',
              is_animated: true,
              thumbnail: { file_id: 'TA' },
            },
            { file_id: 'B', file_unique_id: 'ub', emoji: '😂' },
          ],
        },
      },
      () =>
        jsonResponse(
          { ok: false, description: 'Bad Request: STICKERSET_INVALID' },
          400
        ),
      {
        ok: true,
        result: {
          name: 'AllHello',
          stickers: [{ file_id: 'C', emoji: '😺', is_video: true }],
        },
      }
    );
    const live = createTelegramBotLive({
      token: 'bot-token',
      fetchImpl,
      baseUrl: 'https://tg.test',
    });
    const { stickers, failures } = await live.listGreetingStickers({
      sets: ['UtyaDuck', 'Missing', { name: 'AllHello', all: true }],
    });
    expect(stickers.map((s) => s.id)).toEqual(['A', 'C']);
    expect(stickers[0]).toEqual({
      network: 'telegram',
      id: 'A',
      uniqueId: 'ua',
      pack: 'UtyaDuck',
      packTitle: 'Utya',
      emoji: '👋',
      format: 'tgs',
      thumbnailFileId: 'TA',
      addUrl: 'https://t.me/addstickers/UtyaDuck',
    });
    expect(stickers[1].format).toBe('webm');
    expect(failures).toEqual([
      {
        pack: 'Missing',
        error: 'telegram getStickerSet: Bad Request: STICKERSET_INVALID',
      },
    ]);
  });

  it('downloads thumbnails server-side through getFile', async () => {
    const fetchImpl = mockFetch(
      { ok: true, result: { file_path: 'thumbnails/file_1.webp' } },
      () => ({
        ok: true,
        status: 200,
        async arrayBuffer() {
          return new Uint8Array([1, 2, 3]).buffer;
        },
      })
    );
    const live = createTelegramBotLive({
      token: 'bot-token',
      fetchImpl,
      baseUrl: 'https://tg.test',
    });
    const file = await live.fetchFile('TA');
    expect(fetchImpl.calls[1].url.pathname).toBe(
      '/file/botbot-token/thumbnails/file_1.webp'
    );
    expect([...file.bytes]).toEqual([1, 2, 3]);
  });

  it('records incoming stickers from updates and Desktop exports', async () => {
    const [link] = telegramUpdatesToLinks([
      {
        update_id: 1,
        message: {
          message_id: 3,
          from: { id: 9 },
          chat: { id: 9 },
          date: 1,
          sticker: {
            file_id: 'F',
            file_unique_id: 'U',
            set_name: 'UtyaDuck',
            emoji: '👋',
          },
        },
      },
    ]);
    expect(link.sticker).toEqual({
      id: 'U',
      fileId: 'F',
      pack: 'UtyaDuck',
      emoji: '👋',
    });
    expect(isGreetingMessage(link)).toBe(true);
    const [archived] = await telegramSource.parseArchive({
      id: 1,
      messages: [
        {
          id: 1,
          type: 'message',
          from_id: 'user9',
          text: '',
          media_type: 'sticker',
          file: 'stickers/sticker.webp',
          sticker_emoji: '👋',
        },
      ],
    });
    expect(archived.sticker.emoji).toBe('👋');
  });
});

describe('WhatsApp and Messenger greeting stickers', () => {
  it('sends a WhatsApp sticker by media id or by link', async () => {
    const fetchImpl = mockFetch({ messages: [{ id: 'w1' }] }, { messages: [] });
    const live = createWhatsAppCloudLive({
      token: 'wa',
      phoneNumberId: '100',
      fetchImpl,
      baseUrl: 'https://wa.test',
    });
    await live.post({ to: '15550001', sticker: { id: 'MEDIA' } });
    await live.post({
      to: '15550001',
      sticker: { url: 'https://example.test/hi.webp' },
    });
    expect(fetchImpl.calls[0].body).toEqual({
      messaging_product: 'whatsapp',
      to: '15550001',
      type: 'sticker',
      sticker: { id: 'MEDIA' },
    });
    expect(fetchImpl.calls[1].body.sticker).toEqual({
      link: 'https://example.test/hi.webp',
    });
  });

  it('sends a Messenger sticker by sticker_id', async () => {
    const fetchImpl = mockFetch({ message_id: 'm1' });
    const live = createFacebookLive({
      token: 'fb',
      pageId: 'PAGE',
      fetchImpl,
      baseUrl: 'https://fb.test',
    });
    await live.post({
      to: 'PSID',
      sticker: { id: builtInGreetingStickers.facebook[0].id },
    });
    expect(fetchImpl.calls[0].url.pathname).toBe('/PAGE/messages');
    expect(fetchImpl.calls[0].body.message).toEqual({
      sticker_id: 369239263222822,
    });
  });
});

const sampleLinks = () => [
  // Never written to: greeted first.
  msg('vk', '1', '100', '100', 'Ok', hoursAgo(500)),
  // Written to recently: left alone.
  msg('vk', '2', '200', '200', 'Ok', hoursAgo(10)),
  msg('vk', '3', '200', 'me', 'Sure', hoursAgo(9)),
  // Written to long ago and quiet since: re-greeted after the new ones.
  msg('vk', '4', '300', '300', 'Ok', hoursAgo(2000)),
  msg('vk', '5', '300', 'me', 'Bye', hoursAgo(1999)),
  // WhatsApp contact who wrote 30 h ago: outside the 24 h window.
  msg('whatsapp', 'w1', '1555', '1555', 'Hello', hoursAgo(30)),
  // Telegram contact who just said hi: fits reply mode.
  msg('telegram', 't1', '77', '77', 'Привет!', hoursAgo(1)),
  // Telegram contact who sent a 👋 sticker.
  msg('telegram', 't2', '78', '78', '', {
    timestamp: hoursAgo(2),
    sticker: { id: 'u', emoji: '👋' },
  }),
  // A question, not a greeting.
  msg('telegram', 't3', '79', '79', 'hi, can you help?', hoursAgo(3)),
];

const firstChoice = () => 0;

describe('greeting planner', () => {
  it('summarises chats per network with the last message and direction', () => {
    const chats = summarizeChats(sampleLinks());
    const vk300 = chats.find((c) => c.chat === '300');
    expect(vk300.outgoing).toBe(1);
    expect(vk300.incoming).toBe(1);
    expect(vk300.lastOutgoing).toBe(true);
    expect(vk300.contact).toBe('300');
  });

  it('treats the numeric id passed as `me` as the user', () => {
    const links = [msg('vk', '1', '5', '42', 'hi', hoursAgo(1))];
    expect(summarizeChats(links)[0].outgoing).toBe(0);
    expect(summarizeChats(links, { me: '42' })[0].outgoing).toBe(1);
  });

  it('initiates with new chats first, then quiet ones, and respects messaging windows', () => {
    const plan = planGreetings({
      links: sampleLinks(),
      networks: ['vk', 'whatsapp'],
      now: NOW,
      random: firstChoice,
    });
    expect(plan.mode).toBe('initiate');
    const order = plan.envelopes.map((e) => `${e.network}:${e.chat}`);
    expect(order).toEqual(['vk:100', 'whatsapp:1555', 'vk:300']);
    const [first, whatsapp] = plan.envelopes;
    expect(first.kind).toBe('sticker');
    expect(first.sticker.id).toBe(vkGreetingStickers[0].id);
    expect(whatsapp.skipped).toBe('outside-messaging-window');
  });

  it('skips chats already greeted and honours the limit', () => {
    const plan = planGreetings({
      links: sampleLinks(),
      networks: ['vk'],
      greeted: [greetingLinkId('vk', '100')],
      limit: 1,
      now: NOW,
      random: firstChoice,
    });
    expect(plan.envelopes.map((e) => e.chat)).toEqual(['300']);
  });

  it('falls back to text where the network has no stickers or the user prefers words', () => {
    const links = [msg('x', '1', 'dm1', 'u1', 'Ok', hoursAgo(5))];
    const [env] = planGreetings({
      links,
      now: NOW,
      random: firstChoice,
    }).envelopes;
    expect(env.kind).toBe('text');
    expect(env.text).toBe('Hi!');
    const selection = normalizeGreetingSelection({
      prefer: 'text',
      language: 'ru',
    });
    const [vk] = planGreetings({
      links: sampleLinks(),
      networks: ['vk'],
      selection,
      now: NOW,
      random: firstChoice,
    }).envelopes;
    expect(vk.kind).toBe('text');
    expect(vk.text).toBe('Привет!');
  });

  it('replies to unanswered greetings in the language they were written in', () => {
    const plan = planGreetings({
      links: sampleLinks(),
      mode: 'reply',
      selection: normalizeGreetingSelection({ prefer: 'text' }),
      now: NOW,
      random: firstChoice,
    });
    expect(plan.envelopes.map((e) => e.chat)).toEqual(['77', '78', '1555']);
    expect(plan.envelopes[0].language).toBe('ru');
    expect(plan.envelopes[0].text).toBe('Привет!');
    expect(plan.envelopes[1].language).toBe('und');
    expect(plan.envelopes[1].text).toBe('Hi!');
    // WhatsApp's "Hello" is 30 h old: past the 24 h window.
    expect(plan.envelopes[2].skipped).toBe('outside-messaging-window');
  });

  it('marks chats it cannot greet instead of dropping them silently', () => {
    const links = [msg('github', '1', 'repo', 'u', 'Ok', hoursAgo(1))];
    const [env] = planGreetings({ links, now: NOW }).envelopes;
    expect(env.skipped).toBe('network-unsupported');
  });
});

describe('greeting runner', () => {
  it('posts each envelope, records it and skips what the plan skipped', async () => {
    const posted = [];
    const resolveSource = (name) => ({
      live: {
        async post(content, options) {
          posted.push({ name, content, options });
          if (content.chat === 'boom') {
            throw new Error('vk API 901: Can not send messages');
          }
          return { ok: true };
        },
      },
    });
    const store = createMemoryStore();
    const sleeps = [];
    const plan = {
      envelopes: [
        {
          network: 'vk',
          chat: '100',
          kind: 'sticker',
          sticker: { id: '21' },
          text: null,
        },
        { network: 'vk', chat: 'boom', kind: 'text', text: 'Hi!' },
        { network: 'whatsapp', chat: '1', skipped: 'outside-messaging-window' },
        { network: 'vk', chat: '300', kind: 'text', text: 'Hi!' },
      ],
    };
    const results = await runGreetings(plan, {
      store,
      resolveSource,
      credentials: { vk: { token: 'vk-token' } },
      delayMs: 30000,
      sleep: async (ms) => sleeps.push(ms),
      now: () => '2026-10-11T12:00:00.000Z',
    });
    expect(results.map((r) => r.ok)).toEqual([true, false, false, true]);
    expect(results[1].error).toBe('vk API 901: Can not send messages');
    expect(results[2].error).toBe('outside-messaging-window');
    expect(posted[0].content).toEqual({
      chat: '100',
      to: '100',
      sticker: { id: '21', url: undefined },
    });
    expect(posted[0].options).toEqual({ token: 'vk-token' });
    expect(sleeps).toEqual([30000, 30000]);
    const record = await store.get(greetingLinkId('vk', '100'));
    expect(record.kind).toBe('sticker');
    expect(record.sentAt).toBe('2026-10-11T12:00:00.000Z');
    expect(await store.get(greetingLinkId('vk', 'boom'))).toBeNull();
  });
});

describe('greeting selection and credentials', () => {
  it('defaults to the stickers vk-bot greets with and every Telegram set', () => {
    const selection = defaultGreetingSelection();
    expect(selection.stickers.every((s) => s.common)).toBe(true);
    expect(selection.stickers.some((s) => s.network === 'facebook')).toBe(true);
    expect(selection.telegramSets.length).toBe(telegramGreetingSets.length);
  });

  it('stores the normalised selection and drops invalid entries', async () => {
    const store = createMemoryStore();
    expect((await loadGreetingSelection(store)).language).toBe('en');
    const saved = await saveGreetingSelection(store, {
      stickers: [
        { network: 'vk', id: 21, previewUrl: vkStickerPreview(21) },
        { network: 'nowhere', id: '1' },
        { network: 'telegram' },
      ],
      telegramSets: ['UtyaDuck', 'bad name!'],
      texts: { ru: ['  Хай  ', ''], xx: [] },
      language: 'ru',
    });
    expect(saved.stickers.map((s) => `${s.network}:${s.id}`)).toEqual([
      'vk:21',
    ]);
    expect(saved.telegramSets).toEqual(['UtyaDuck']);
    expect(saved.texts.ru).toEqual(['Хай']);
    expect(saved.language).toBe('ru');
    const link = await store.get(GREETING_SELECTION_ID);
    expect(link.tokens).toEqual(['greetings', 'selection']);
    expect(await loadGreetingSelection(store)).toEqual(saved);
  });

  it('reads network credentials from the secrets named in the connection guides', async () => {
    const store = createMemoryStore();
    await store.put({ id: 'secret:vk:token', tokens: [], value: 'vk-t' });
    await store.put({
      id: 'secret:whatsapp:phone-number-id',
      tokens: [],
      value: '100',
    });
    const credentials = await loadGreetingCredentials(store);
    expect(credentials.vk).toEqual({ token: 'vk-t' });
    expect(credentials.whatsapp).toEqual({ phoneNumberId: '100' });
    expect(credentials.telegram).toEqual({});
  });

  it('lists live stickers per network and reports what cannot be listed', async () => {
    const resolveSource = (name) =>
      name === 'vk'
        ? {
            live: {
              async listGreetingStickers({ token }) {
                expect(token).toBe('vk-t');
                return {
                  stickers: [{ network: 'vk', id: '21' }],
                  failures: [],
                };
              },
            },
          }
        : {
            live: {
              async listGreetingStickers({ sets }) {
                expect(sets).toEqual(['UtyaDuck']);
                return {
                  stickers: [],
                  failures: [{ pack: 'UtyaDuck', error: 'nope' }],
                };
              },
            },
          };
    const result = await listLiveGreetingStickers({
      networks: ['vk', 'telegram'],
      selection: normalizeGreetingSelection({ telegramSets: ['UtyaDuck'] }),
      resolveSource,
      credentials: { vk: { token: 'vk-t' } },
    });
    expect(result.stickers).toEqual([{ network: 'vk', id: '21' }]);
    expect(result.failures).toEqual([
      { network: 'telegram', pack: 'UtyaDuck', error: 'nope' },
    ]);
    const unsupported = await listLiveGreetingStickers({
      networks: ['x'],
      resolveSource: () => ({ live: {} }),
    });
    expect(unsupported.failures).toEqual([
      { network: 'x', error: 'listing-unsupported' },
    ]);
  });
});
