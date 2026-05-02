import { describe, it, expect } from 'test-anywhere';
import { setImmediate } from 'node:timers';

import { createMemoryStore } from '../src/storage/index.js';
import {
  getSource,
  pullLiveInto,
  stampSourceLink,
} from '../src/sources/index.js';
import { createTelegramBotLive } from '../src/sources/telegram.js';
import { createHandlerBus, sourcePullHandler } from '../src/handlers/index.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

const jsonResponse = (body, ok = true, status = ok ? 200 : 500) => ({
  ok,
  status,
  async json() {
    return body;
  },
});

describe('telegram real archive import', () => {
  it('parses Telegram Desktop all-chats exports without id collisions', async () => {
    const archive = {
      chats: {
        list: [
          {
            id: 100,
            name: 'Friends',
            messages: [
              {
                id: 1,
                type: 'message',
                from_id: 'user1',
                date: '2026-05-01T10:00:00',
                text: ['Hi ', { type: 'bold', text: 'Alice' }],
              },
            ],
          },
          {
            id: 200,
            name: 'Work',
            messages: [
              {
                id: 1,
                type: 'message',
                from: 'Bob',
                date_unixtime: '1777629601',
                text_entities: [{ type: 'plain', text: 'same local id' }],
              },
            ],
          },
        ],
      },
    };

    const links = await getSource('telegram').parseArchive(archive);

    expect(links.length).toBe(2);
    expect(links[0].id).toBe('msg:telegram:1');
    expect(links[0].body).toBe('Hi Alice');
    expect(links[0].chat).toBe('100');
    expect(links[1].id).toBe('msg:telegram:200:1');
    expect(links[1].body).toBe('same local id');
  });
});

describe('telegram bot live connector', () => {
  it('pulls updates, sends messages, and syncs bot profile fields', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (url.endsWith('/getUpdates')) {
        return jsonResponse({
          ok: true,
          result: [
            {
              update_id: 41,
              message: {
                message_id: 7,
                from: { id: 9, username: 'alice' },
                chat: { id: 44, title: 'Room' },
                date: 1777629600,
                text: 'hello from telegram',
              },
            },
          ],
        });
      }
      if (url.endsWith('/sendMessage')) {
        return jsonResponse({
          ok: true,
          result: {
            message_id: 8,
            chat: { id: body.chat_id },
            date: 1777629601,
            text: body.text,
          },
        });
      }
      return jsonResponse({ ok: true, result: true });
    };

    const live = createTelegramBotLive({
      token: '123:test',
      fetchImpl,
      baseUrl: 'https://telegram.test',
    });

    const pulled = await live.pullMessages({ offset: 40, limit: 10 });
    expect(pulled.nextOffset).toBe(42);
    expect(pulled.links[0].id).toBe('msg:telegram:7');
    expect(pulled.links[0].sender).toBe('9');
    expect(pulled.links[0].body).toBe('hello from telegram');

    const sent = await live.post({ chat: 44, text: 'queued reply' });
    expect(sent.messageId).toBe('8');
    expect(calls[1].body.chat_id).toBe(44);

    const profile = await live.syncProfile({
      name: 'Meta Sovereign',
      bio: 'Local-first personal CRM',
    });
    expect(profile.length).toBe(2);
    expect(calls[2].url.endsWith('/setMyName')).toBe(true);
    expect(calls[3].url.endsWith('/setMyDescription')).toBe(true);
  });

  it('imports pulled updates into the store with connector handled stamps', async () => {
    const store = createMemoryStore();
    await store.put({
      id: 'secret:telegram:bot-token',
      tokens: ['secret', 'telegram'],
      value: 'stored-token',
    });
    let seenToken = null;
    const live = {
      async pullMessages(options) {
        seenToken = options.token;
        return {
          nextOffset: 12,
          links: [
            {
              id: 'msg:telegram:11',
              tokens: ['message', 'telegram', '11'],
              source: 'telegram',
              sender: 'alice',
              chat: 'direct:alice',
              body: 'live hello',
            },
          ],
        };
      },
    };

    const result = await pullLiveInto(store, 'telegram', { live });
    const imported = await store.get('msg:telegram:11');

    expect(seenToken).toBe('stored-token');
    expect(result.imported).toBe(1);
    expect(result.nextOffset).toBe(12);
    expect(imported.handled.by).toBe('source:telegram:live');
    expect(Boolean(imported.handledBy['source:telegram:live'])).toBe(true);
  });
});

describe('source-pull handler', () => {
  it('runs live imports from a datastore command link once', async () => {
    const store = createMemoryStore();
    const bus = createHandlerBus(store);
    let pulls = 0;
    const pullLive = async (targetStore, source) => {
      pulls += 1;
      await targetStore.put(
        stampSourceLink(
          {
            id: `msg:${source}:live-1`,
            tokens: ['message', source, 'live-1'],
            source,
            sender: 'alice',
            chat: 'direct:alice',
            body: 'from handler',
          },
          source
        )
      );
      return { source, imported: 1, nextOffset: 2 };
    };
    const { selector, run } = sourcePullHandler({ pullLive });
    bus.register('source-pull', selector, run);

    await store.put({
      id: 'source-pull:telegram:test',
      tokens: ['source-pull', 'telegram'],
      source: 'telegram',
      offset: 1,
    });
    for (let i = 0; i < 6; i += 1) {
      await flush();
    }

    expect(pulls).toBe(1);
    const command = await store.get('source-pull:telegram:test');
    expect(command.status).toBe('done');
    expect(command.imported).toBe(1);
    expect(Boolean(command.handledBy['source-pull'])).toBe(true);

    await store.put(command);
    for (let i = 0; i < 4; i += 1) {
      await flush();
    }
    expect(pulls).toBe(1);
  });
});
