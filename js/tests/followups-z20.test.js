// R-Z20: VK inline media and captcha, VK scroll-back, GitHub notification
// "mark read", and mail on the shared pull runner. Fakes only (a fake VK
// `fetch`, a fake GitHub server on 127.0.0.1); nothing touches a network.

import { describe, it, expect } from 'test-anywhere';

import { createMemoryStore } from '../src/storage/index.js';
import { startServer, CSP } from '../src/server/index.js';
import { createVkInbox } from '../src/sources/vk-sync.js';
import { createVkLive } from '../src/sources/vk.js';
import {
  onHosts,
  vkCaptchaImage,
  vkMediaUrl,
  VK_MEDIA_HOSTS,
} from '../src/sources/vk-hosts.js';
import { markSendOutcome } from '../src/sources/http.js';
import { createPullRunner, loadPullState } from '../src/sources/pull-runner.js';
import { createGithubService } from '../src/server/github-service.js';
import { historyRequest } from '../src/server/routes-vk.js';
import { askVkOlder } from '../src/web/chat-window.js';
import {
  createFakeVk,
  message,
  userMethods,
  FAKE_VK_BASE,
} from './helpers/fake-vk.js';

const noSleep = async () => {};

const saveToken = (store, source = 'vk') =>
  store.put({
    id: `secret:${source}:access-token`,
    tokens: ['secret', source, 'access-token'],
    children: [],
    token: `${source}-secret-token`,
  });

const inboxOf = (store, fake) =>
  createVkInbox({
    store,
    fetchImpl: fake.fetchImpl,
    baseUrl: FAKE_VK_BASE,
    sleep: noSleep,
    requestsPerSecond: 1000,
  });

const liveOf = (fake) =>
  createVkLive({
    token: 't',
    fetchImpl: fake.fetchImpl,
    baseUrl: FAKE_VK_BASE,
    sleep: noSleep,
  });

describe('VK hosts and the CSP (R-Z20)', () => {
  it('accepts only https files on the exact VK CDN hosts', () => {
    expect(vkMediaUrl('https://psv4.userapi.com/a.mp3')).toBe(
      'https://psv4.userapi.com/a.mp3'
    );
    expect(vkMediaUrl('http://psv4.userapi.com/a.mp3')).toBe(null);
    expect(vkMediaUrl('https://userapi.com.evil.test/a.mp3')).toBe(null);
    expect(vkMediaUrl('https://eviluserapi.com/a.mp3')).toBe(null);
    expect(vkMediaUrl('https://u:p@psv4.userapi.com/a.mp3')).toBe(null);
    expect(vkMediaUrl('https://vk.com/video1_2')).toBe(null);
    expect(vkMediaUrl('not a url')).toBe(null);
    expect(onHosts('https://a.vk-cdn.net/x', VK_MEDIA_HOSTS)).toBeTruthy();
  });

  it('shows the captcha picture only from VK API hosts', () => {
    expect(vkCaptchaImage('https://api.vk.com/captcha.php?sid=1')).toBeTruthy();
    expect(vkCaptchaImage('https://api.vk.ru/captcha.php?sid=1')).toBeTruthy();
    expect(vkCaptchaImage('https://evil.test/captcha.php')).toBe(null);
    expect(vkCaptchaImage('http://api.vk.com/captcha.php')).toBe(null);
  });

  it('the CSP lists exact media hosts, the captcha host, and no media-src *', () => {
    const media = CSP.split('; ').find((d) => d.startsWith('media-src'));
    expect(media).toBe(
      "media-src 'self' https://*.userapi.com https://*.vk-cdn.net https://*.vkuseraudio.net https://*.vkuservideo.net"
    );
    const img = CSP.split('; ').find((d) => d.startsWith('img-src'));
    expect(img).toContain('https://api.vk.com');
    expect(img).toContain('https://api.vk.ru');
    expect(CSP).not.toMatch(/media-src[^;]*[ ]\*[ ;]/);
  });
});

describe('VK audio and video attachments (R-Z20)', () => {
  const attach = async (attachments) => {
    const fake = createFakeVk({
      methods: {
        'messages.getHistory': () => ({
          count: 1,
          items: [message(9, 7, 'x', { attachments })],
        }),
      },
    });
    const page = await liveOf(fake).pullMessages({ peerId: 7 });
    return page.links[0].attachments;
  };

  it('plays direct files on VK CDNs, links out everything else', async () => {
    const [voice, audio, plain, video, direct, odd] = await attach([
      {
        type: 'audio_message',
        audio_message: {
          link_ogg: 'https://cs1.vkuseraudio.net/v.ogg',
          link_mp3: 'https://cs1.vkuseraudio.net/v.mp3',
          duration: 3,
        },
      },
      {
        type: 'audio',
        audio: {
          artist: 'A',
          title: 'T',
          url: 'https://cs2.vkuseraudio.net/a.mp3?x=1',
        },
      },
      { type: 'audio', audio: { artist: 'B', title: 'U' } },
      {
        type: 'video',
        video: {
          owner_id: -5,
          id: 12,
          title: 'Clip',
          player: 'https://vk.com/video_ext.php?oid=-5&id=12',
        },
      },
      {
        type: 'video',
        video: {
          owner_id: 1,
          id: 2,
          files: { mp4_480: 'https://vkvd1.vkuservideo.net/v.mp4' },
        },
      },
      {
        type: 'video',
        video: {
          owner_id: 1,
          id: 3,
          files: { mp4_480: 'https://evil.test/v.mp4' },
        },
      },
    ]);
    expect(voice.src).toBe('https://cs1.vkuseraudio.net/v.mp3');
    expect(audio.src).toBe('https://cs2.vkuseraudio.net/a.mp3?x=1');
    expect(plain.src).toBe(undefined);
    // video.get's `player` is an iframe page: never kept, never framed.
    expect(video.src).toBe(undefined);
    expect(video.url).toBe('https://vk.com/video-5_12');
    expect(JSON.stringify(video)).not.toContain('video_ext');
    expect(direct.src).toBe('https://vkvd1.vkuservideo.net/v.mp4');
    expect(odd.src).toBe(undefined);
  });
});

describe('VK scroll-back (R-Z20)', () => {
  const history = (calls, pages) => ({
    ...userMethods({
      'messages.getHistory': (params) => {
        calls.push(params);
        return pages.shift() ?? { count: 0, items: [] };
      },
    }),
  });

  it('asks for the page before the oldest, dedupes, and stops at the beginning', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    const calls = [];
    const fake = createFakeVk({
      methods: history(calls, [
        { count: 5, items: [message(30, 7, 'c'), message(29, 7, 'b')] },
        { count: 5, items: [message(30, 7, 'c'), message(28, 7, 'a')] },
        { count: 5, items: [] },
      ]),
    });
    const inbox = inboxOf(store, fake);
    const first = await inbox.older({ peerId: '7', before: '31' });
    expect(first).toEqual({ imported: 2, complete: false });
    expect(calls[0].start_message_id).toBe('31');
    expect(calls[0].offset).toBe('1');
    expect(calls[0].count).toBe('50');
    // 30 is stored already: only 28 is new.
    const second = await inbox.older({ peerId: '7', before: '29' });
    expect(second.imported).toBe(1);
    expect(await store.get('msg:vk:28')).toBeTruthy();
    // Nothing older: the chat is marked finished once, then never asked again.
    const last = await inbox.older({ peerId: '7', before: '28' });
    expect(last).toEqual({ imported: 0, complete: true });
    expect((await store.get('history:vk:7')).complete).toBe(true);
    const asked = calls.length;
    const again = await inbox.older({ peerId: '7', before: '28' });
    expect(again.complete).toBe(true);
    expect(calls.length).toBe(asked);
  });

  it('a captcha is reported, never solved, and the retry carries the answer once', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    const calls = [];
    let challenge = true;
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getHistory': (params) => {
          calls.push(params);
          if (challenge) {
            challenge = false;
            return {
              error: {
                error_code: 14,
                error_msg: 'Captcha needed',
                captcha_sid: '555',
                captcha_img: 'https://api.vk.com/captcha.php?sid=555',
              },
            };
          }
          return { count: 1, items: [message(4, 7, 'old')] };
        },
      }),
    });
    const inbox = inboxOf(store, fake);
    const error = await inbox
      .older({ peerId: '7', before: '9' })
      .catch((e) => e);
    expect(error.code).toBe('captcha');
    expect(error.captchaSid).toBe('555');
    expect(calls.length).toBe(1);
    expect(calls[0].captcha_sid).toBe(undefined);
    const done = await inbox.older({
      peerId: '7',
      before: '9',
      captchaSid: '555',
      captchaKey: 'abc12',
    });
    expect(done.imported).toBe(1);
    expect(calls.length).toBe(2);
    expect(calls[1].captcha_sid).toBe('555');
    expect(calls[1].captcha_key).toBe('abc12');
  });
});

describe('VK scroll-back route and page (R-Z20)', () => {
  it('checks the request body strictly', () => {
    expect(historyRequest({ chat: '7' })).toEqual({
      peerId: '7',
      before: undefined,
      captchaSid: undefined,
      captchaKey: undefined,
    });
    expect(historyRequest({ chat: 2000000001, before: 9 }).before).toBe('9');
    expect(historyRequest({}).error).toBeTruthy();
    expect(historyRequest({ chat: '0' }).error).toBeTruthy();
    expect(historyRequest({ chat: 'a b' }).error).toBeTruthy();
    expect(historyRequest({ chat: '7', before: '../x' }).error).toBeTruthy();
    expect(historyRequest({ chat: '7', captchaSid: '1' }).error).toBeTruthy();
    expect(
      historyRequest({ chat: '7', captchaSid: '1', captchaKey: 'a b' }).error
    ).toBeTruthy();
  });

  it('POST /api/vk/history: a captcha is HTTP 409 with VK-hosted picture only', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    let img = 'https://api.vk.com/captcha.php?sid=1';
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getHistory': () => ({
          error: {
            error_code: 14,
            error_msg: 'Captcha needed',
            captcha_sid: '1',
            captcha_img: img,
          },
        }),
      }),
    });
    const handle = await startServer({
      port: 0,
      store,
      enableHandlers: false,
      enableSync: false,
      emailPoll: false,
      pulls: {
        vk: {
          fetchImpl: fake.fetchImpl,
          baseUrl: FAKE_VK_BASE,
          requestsPerSecond: 1000,
          sleep: noSleep,
        },
        minGapMs: 0,
      },
    });
    const post = async (body) => {
      const r = await fetch(`http://127.0.0.1:${handle.port}/api/vk/history`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };
    try {
      const bad = await post({ chat: 'x' });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('bad-request');
      const asked = await post({ chat: '7', before: '9' });
      expect(asked.status).toBe(409);
      expect(asked.body.code).toBe('captcha');
      expect(asked.body.captcha).toEqual({ sid: '1', img });
      img = 'https://evil.test/c.png';
      const hostile = await post({ chat: '7', before: '9' });
      expect(hostile.body.captcha.img).toBe(null);
    } finally {
      await handle.close();
    }
  });

  it('the page asks the user once and repeats the request once; cancel holds', async () => {
    const calls = [];
    const challenge = { sid: '9', img: 'https://api.vk.com/c.png' };
    const make = (answers) => ({
      vkHistory: async (body) => {
        calls.push(body);
        return answers.shift();
      },
    });
    const chat = { chat: '7' };
    const oldest = { id: 'msg:vk:31' };
    const captcha = { ok: false, code: 'captcha', captcha: challenge };
    // Solved: the second request carries the sid and the typed key.
    const solved = await askVkOlder(
      make([captcha, { ok: true, complete: true }]),
      chat,
      oldest,
      async () => 'k3y'
    );
    expect(solved).toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual({ chat: '7', before: '31' });
    expect(calls[1].captchaSid).toBe('9');
    expect(calls[1].captchaKey).toBe('k3y');
    // Cancelled: no second request, and the window is held, not retried.
    calls.length = 0;
    const cancelled = await askVkOlder(
      make([captcha]),
      chat,
      oldest,
      async () => null
    ).catch((e) => e);
    expect(cancelled.hold).toBe(true);
    expect(calls.length).toBe(1);
    // A second captcha after the one retry is held too, not asked again.
    calls.length = 0;
    const twice = await askVkOlder(
      make([captcha, captcha]),
      chat,
      oldest,
      async () => 'x'
    ).catch((e) => e);
    expect(twice.hold).toBe(true);
    expect(calls.length).toBe(2);
  });
});

describe('background pulls never ask for a captcha (R-Z20)', () => {
  it('marks the connection as needing attention and backs off', async () => {
    const store = createMemoryStore();
    let runs = 0;
    const pending = [];
    const runner = createPullRunner({
      store,
      minGapMs: 0,
      setTimer: (fn, ms) => {
        const timer = { fn, ms, unref() {} };
        pending.push(timer);
        return timer;
      },
      clearTimer: () => {},
      jobs: {
        vk: {
          ready: async () => true,
          run: async () => {
            runs += 1;
            throw Object.assign(new Error('captcha'), { code: 'captcha' });
          },
          intervalMs: 600_000,
        },
      },
    });
    runner.start();
    runner.start();
    expect(pending.length).toBe(1);
    await pending[0].fn();
    expect(runs).toBe(1);
    const state = await loadPullState(store, 'vk');
    expect(state.lastError.code).toBe('captcha');
    expect(state.lastError.needsAttention).toBe(true);
    // The next try waits twice as long; nothing was shown or solved.
    expect(pending.at(-1).ms).toBe(1_200_000);
    runner.stop();
  });
});

describe('GitHub notification "mark read" (R-Z20)', () => {
  const stored = async (store) => {
    await store.put({ id: 'secret:github:access-token', token: 'pat' });
    await store.put({
      id: 'notification:github:42',
      source: 'github',
      threadId: '42',
      unread: true,
    });
  };

  it('an ambiguous network failure is send-unknown, not repeated, and stays unread', async () => {
    const store = createMemoryStore();
    await stored(store);
    let calls = 0;
    const service = createGithubService({
      store,
      ctx: {
        githubLiveFactory: () => ({
          markThreadRead: async () => {
            calls += 1;
            throw markSendOutcome(new Error('socket hang up'), {
              ambiguous: true,
            });
          },
        }),
      },
    });
    const error = await service.markRead({ threadId: '42' }).catch((e) => e);
    expect(error.code).toBe('send-unknown');
    expect(error.fallback).toBe(false);
    expect(calls).toBe(1);
    expect((await store.get('notification:github:42')).unread).toBe(true);
  });

  it('a clear refusal keeps its own error and a success clears the unread flag', async () => {
    const store = createMemoryStore();
    await stored(store);
    let refuse = true;
    const service = createGithubService({
      store,
      ctx: {
        githubLiveFactory: () => ({
          markThreadRead: async () => {
            if (refuse) {
              throw markSendOutcome(new Error('HTTP 404'), {
                status: 404,
                ambiguous: false,
              });
            }
            return { ok: true };
          },
        }),
      },
    });
    const error = await service.markRead({ threadId: '42' }).catch((e) => e);
    expect(error.code).not.toBe('send-unknown');
    expect((await store.get('notification:github:42')).unread).toBe(true);
    refuse = false;
    await service.markRead({ threadId: '42' });
    expect((await store.get('notification:github:42')).unread).toBe(false);
  });
});

describe('mail on the shared pull runner (R-Z20)', () => {
  it('has one job on the server runner, no second timer', async () => {
    const store = createMemoryStore();
    await store.put({ id: 'secret:email:access-token', token: 'tok' });
    let pulls = 0;
    const handle = await startServer({
      port: 0,
      store,
      enableHandlers: false,
      enableSync: false,
      pulls: { minGapMs: 0 },
      emailPoll: {
        intervalMs: 60_000,
        firstMs: 60_000,
        pull: async () => {
          pulls += 1;
          return { imported: 2 };
        },
      },
    });
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/api/pull`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'email' }),
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.imported).toBe(2);
      expect(pulls).toBe(1);
      const status = await (
        await fetch(`http://127.0.0.1:${handle.port}/api/pull/status`)
      ).json();
      expect(status.sources.email.connected).toBe(true);
      expect(status.sources.email.needsAttention).toBe(false);
    } finally {
      await handle.close();
    }
  });
});
