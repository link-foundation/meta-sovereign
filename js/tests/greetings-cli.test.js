// Issue #35: the greeting subcommands. The catalogue, the selection and
// the plan answer from the store alone; live listing and sending go
// through injected source adapters, and sends pause like vk-bot.

import { describe, it, expect } from 'test-anywhere';

import { buildMessageLink } from '../src/sources/link.js';
import { createMemoryStore } from '../src/storage/index.js';
import { runCli } from '../src/cli/index.js';
import {
  DEFAULT_SEND_DELAY_MS,
  GREETINGS_HELP,
  createGreetingCommands,
  parseStickerList,
  planOptions,
} from '../src/cli/greetings-commands.js';
import { greetingLinkId, vkGreetingStickers } from '../src/greetings/index.js';

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const ROWS = [
  ['vk', '1', '100', '100', 'Ok', hoursAgo(500)],
  ['vk', '2', '200', '200', 'Ok', hoursAgo(700)],
  ['whatsapp', 'w1', '1555', '1555', 'Hello', hoursAgo(30)],
];

const seed = async (store, rows = ROWS) => {
  for (const [source, externalId, chat, sender, body, timestamp] of rows) {
    await store.put(
      buildMessageLink({ source, externalId, chat, sender, body, timestamp })
    );
  }
  return store;
};

/** Commands bound to one in-memory store and recording fake adapters. */
const greetingsCli = (store = createMemoryStore()) => {
  const calls = [];
  const sleeps = [];
  const resolveSource = (name) => ({
    live: {
      async post(content, options) {
        calls.push({ name, content, options });
        if (content.chat === '200') {
          throw new Error('vk API 901: Can not send messages');
        }
        return { ok: true };
      },
      ...(name === 'vk'
        ? {
            async listGreetingStickers({ token }) {
              calls.push({ name, token });
              return {
                stickers: [{ network: 'vk', id: '21', emoji: '👋' }],
                failures: [],
              };
            },
          }
        : {}),
    },
  });
  const commands = createGreetingCommands({
    openStore: async () => store,
    resolveSource,
    sleep: async (ms) => sleeps.push(ms),
  });
  const run = async (name, args = {}) => {
    const out = [];
    const code = await commands[name](args, (line) => out.push(line));
    return { code, out, text: out.join('\n') };
  };
  return { run, store, calls, sleeps };
};

describe('greetings cli flags', () => {
  it('parses network:id sticker lists and keeps colons inside ids', () => {
    expect(parseStickerList('vk:21, telegram:CAAC:x-1')).toEqual([
      {
        network: 'vk',
        id: '21',
        previewUrl: 'https://vk.com/sticker/1-21-512',
      },
      { network: 'telegram', id: 'CAAC:x-1', previewUrl: null },
    ]);
    expect(() => parseStickerList('21')).toThrow();
    expect(() => parseStickerList('myspace:1')).toThrow();
  });

  it('defaults plans to initiating ten chats quiet for thirty days', () => {
    expect(planOptions({})).toEqual({
      mode: 'initiate',
      networks: null,
      me: null,
      limit: 10,
      staleDays: 30,
    });
    expect(
      planOptions({ mode: 'reply', networks: 'vk,telegram' }).networks
    ).toEqual(['vk', 'telegram']);
  });

  it('is listed in the CLI help', async () => {
    const out = [];
    await runCli(['help'], { log: (m) => out.push(m) });
    expect(out.join('\n')).toContain(GREETINGS_HELP);
  });
});

describe('greetings cli catalogue and selection', () => {
  it('prints the built-in stickers with their vk.com preview links', async () => {
    const { run } = greetingsCli();
    const { code, out } = await run('greetings-stickers');
    expect(code).toBe(0);
    const first = vkGreetingStickers[0];
    expect(out[0]).toContain(`vk\t${first.id}`);
    expect(out[0]).toContain(first.previewUrl);
    expect(out.some((line) => line.includes('t.me/addstickers/'))).toBe(true);
  });

  it('lists live stickers with the stored token and reports what cannot list', async () => {
    const { run, store, calls } = greetingsCli();
    await store.put({
      id: 'secret:vk:access-token',
      tokens: [],
      value: 'vk-t',
    });
    const { code, text } = await run('greetings-stickers', {
      live: true,
      networks: 'vk,x',
    });
    expect(code).toBe(0);
    expect(calls[0]).toEqual({ name: 'vk', token: 'vk-t' });
    expect(text).toContain('vk\t21\t👋');
    expect(text).toContain('! x: listing-unsupported');
  });

  it('saves the picked stickers, sets, language and preference', async () => {
    const { run } = greetingsCli();
    const saved = await run('greetings-select', {
      stickers: 'vk:72789,facebook:369239263222822',
      sets: 'UtyaDuck',
      language: 'ru',
      prefer: 'text',
      json: true,
    });
    const selection = JSON.parse(saved.text);
    expect(selection.stickers.map((s) => s.id)).toEqual([
      '72789',
      '369239263222822',
    ]);
    expect(selection.telegramSets).toEqual(['UtyaDuck']);
    expect(selection.prefer).toBe('text');
    const shown = await run('greetings-select');
    expect(shown.out[0]).toBe('language ru, prefer text');
  });

  it('reports bad flags as an error line and a non-zero exit', async () => {
    const { run } = greetingsCli();
    const { code, text } = await run('greetings-select', { stickers: '21' });
    expect(code).toBe(1);
    expect(text).toContain('error: sticker "21" must look like');
  });
});

describe('greetings cli plan and send', () => {
  it('previews oldest chats first and flags closed messaging windows', async () => {
    const { run, calls } = greetingsCli(await seed(createMemoryStore()));
    const { code, out } = await run('greetings-plan');
    expect(code).toBe(0);
    expect(out[0]).toBe('initiate: 3 chats');
    expect(out[1]).toMatch(/^ {2}vk\t200\ten\tsticker \d+$/);
    expect(out[3]).toContain('skipped: outside-messaging-window');
    expect(calls).toEqual([]);
  });

  it('shows the plan and sends nothing without a confirmation', async () => {
    const { run, calls } = greetingsCli(await seed(createMemoryStore()));
    const { code, text } = await run('greetings-send', { networks: 'vk' });
    expect(code).toBe(1);
    expect(calls).toEqual([]);
    expect(text).toMatch(/Send 2 greeting\(s\)\? Not sent: pass --yes/);
  });

  it('caps --limit so a typo never means everyone', () => {
    expect(planOptions({ limit: 'abc' }).limit).toBe(10);
    expect(planOptions({ limit: 'Infinity' }).limit).toBe(100);
    expect(planOptions({ limit: '5000' }).limit).toBe(100);
    expect(planOptions({ limit: '0' }).limit).toBe(10);
  });

  it('sends with a pause between messages and records what went out', async () => {
    const { run, store, calls, sleeps } = greetingsCli(
      await seed(createMemoryStore())
    );
    const { code, out } = await run('greetings-send', {
      networks: 'vk',
      yes: true,
    });
    expect(code).toBe(1);
    expect(calls.map((c) => c.content.chat)).toEqual(['200', '100']);
    expect(sleeps).toEqual([DEFAULT_SEND_DELAY_MS]);
    const results = out.filter((line) => !line.startsWith('  '));
    expect(results[0]).toContain('! vk API 901');
    expect(results[1]).toMatch(/^sent\tvk\t100/);
    expect(await store.get(greetingLinkId('vk', '100'))).toBeTruthy();
    expect(await store.get(greetingLinkId('vk', '200'))).toBeNull();
  });

  it('exits zero when every send goes out and only window chats are skipped', async () => {
    const store = await seed(
      createMemoryStore(),
      ROWS.filter((row) => row[2] !== '200')
    );
    const { run, sleeps } = greetingsCli(store);
    const { code, text } = await run('greetings-send', {
      'delay-ms': '0',
      yes: true,
    });
    expect(code).toBe(0);
    expect(sleeps).toEqual([]);
    expect(text).toContain('! outside-messaging-window');
  });
});
