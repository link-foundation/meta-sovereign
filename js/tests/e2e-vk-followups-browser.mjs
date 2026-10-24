// Real browser e2e for the VK follow-ups (R-Z20): a VK chat shows a voice
// message and a video as players (direct files on VK's CDNs) and a video that
// only has its VK page as a link-out card (never an iframe, the CSP lists the
// exact media hosts); scrolling back to the top asks VK for older messages
// through the server, a captcha (error 14) opens a dialog with VK's picture
// (focus in the input, Escape cancels), the typed answer repeats the request
// once, and at the beginning of the chat nothing more is asked. A fake VK
// answers inside the server; the CDN and captcha pictures are answered by the
// test, so nothing leaves the machine. Not part of `npm test`; run:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:vk-followups
//   RUN_BROWSER_E2E=1 npm run test:e2e:vk-followups:webkit

import { createMemoryStore } from '../src/storage/universal.js';
import { vkMessageLink } from '../src/sources/vk.js';
import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import {
  createFakeVk,
  message,
  userMethods,
  FAKE_VK_BASE,
} from './helpers/fake-vk.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const store = createMemoryStore();
await store.put({
  id: 'secret:vk:access-token',
  tokens: ['secret', 'vk', 'access-token'],
  children: [],
  token: 'vk-test-token',
});
const seed = async (peer, ids, extra = {}) => {
  for (const id of ids) {
    await store.put(
      vkMessageLink(message(id, peer, `message ${id}`, extra[id] ?? {}))
    );
  }
};
await seed(7, [21, 22, 23, 24, 25, 26, 27, 28, 29], {});
await seed(7, [30], {
  30: {
    attachments: [
      {
        type: 'audio_message',
        audio_message: {
          link_mp3: 'https://cs1.vkuseraudio.net/voice.mp3',
          duration: 7,
        },
      },
      {
        type: 'video',
        video: {
          owner_id: 1,
          id: 2,
          title: 'Direct',
          files: { mp4_480: 'https://vkvd1.vkuservideo.net/v.mp4' },
        },
      },
      {
        type: 'video',
        video: {
          owner_id: -5,
          id: 12,
          title: 'Page only',
          player: 'https://vk.com/video_ext.php?oid=-5&id=12',
          image: [{ width: 320, url: 'https://sun9-1.userapi.com/thumb.jpg' }],
        },
      },
    ],
  },
});
// Older than chat 7, so chat 7 is the one the app opens first.
await seed(8, [41, 42, 43], {
  41: { date: 1_600_000_041 },
  42: { date: 1_600_000_042 },
  43: { date: 1_600_000_043 },
});

const calls = [];
let sevenAnswers = 0;
const captcha = (sid) => ({
  error: {
    error_code: 14,
    error_msg: 'Captcha needed',
    captcha_sid: sid,
    captcha_img: `https://api.vk.com/captcha.php?sid=${sid}`,
  },
});
const fakeVk = createFakeVk({
  methods: userMethods({
    'messages.getConversations': () => ({ count: 0, items: [] }),
    'messages.getHistory': (params) => {
      calls.push(params);
      if (String(params.peer_id) === '8') {
        return captcha('888');
      }
      sevenAnswers += 1;
      if (sevenAnswers === 1) {
        return captcha('777');
      }
      if (sevenAnswers === 2) {
        return {
          count: 20,
          items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((id) =>
            message(id, 7, `message ${id}`)
          ),
        };
      }
      return { count: 20, items: [] };
    },
  }),
});

const { page, base, until, finish } = await openChatApp('vk-followups', {
  store,
  serverOptions: {
    pulls: {
      vk: {
        fetchImpl: fakeVk.fetchImpl,
        baseUrl: FAKE_VK_BASE,
        requestsPerSecond: 1000,
      },
    },
  },
});

const pictures = [];
await page.route(
  /https:\/\/(api\.vk\.com|sun9-\d+\.userapi\.com)\/.*/,
  (route) => {
    pictures.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  }
);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mediaSteps = async (headers) => {
  const csp = headers['content-security-policy'];
  assert(
    csp.includes(
      "media-src 'self' https://*.userapi.com https://*.vk-cdn.net https://*.vkuseraudio.net https://*.vkuservideo.net;"
    ),
    `CSP lists the exact media hosts: ${csp}`
  );
  const media = page.locator('[data-remote-media]');
  await media.waitFor({ timeout: 8000 });
  assert(
    (await media.getAttribute('data-remote-media')) === '3',
    'three attachments'
  );
  const audio = media.locator('audio[data-remote-player="audio"]');
  assert(
    (await audio.getAttribute('src')) ===
      'https://cs1.vkuseraudio.net/voice.mp3',
    'the voice message is an inline player'
  );
  const video = media.locator('video[data-remote-player="video"]');
  assert(
    (await video.getAttribute('src')) === 'https://vkvd1.vkuservideo.net/v.mp4',
    'the direct video is an inline player'
  );
  const card = media.locator('.remote-card a.remote-chip');
  assert(
    (await card.getAttribute('href')) === 'https://vk.com/video-5_12',
    'the page-only video links out to VK'
  );
  assert((await page.locator('iframe').count()) === 0, 'no iframe anywhere');
};

const captchaSteps = async () => {
  // Chat 7 is opened and, being at the top with nothing older stored, asks VK.
  const dialog = page.locator('[data-dialog="vk-captcha"]');
  await dialog.waitFor({ timeout: 8000 });
  const img = dialog.locator('img.vk-captcha-img');
  await until(
    () => img.evaluate((node) => node.complete && node.naturalWidth > 0),
    'the captcha picture loaded from VK'
  );
  assert(
    pictures.includes('https://api.vk.com/captcha.php?sid=777'),
    'the picture came from VK'
  );
  assert(
    (await page.evaluate(() => document.activeElement?.dataset?.field)) ===
      'captcha',
    'the input has the focus'
  );
  assert(calls.length === 1, `asked once so far: ${JSON.stringify(calls)}`);
  await dialog.locator('[data-field="captcha"]').fill('q7x9');
  await dialog.locator('button[data-action="submit"]').click();
  await until(
    async () => (await page.locator('text=message 11').count()) > 0,
    'older messages appear after the answer'
  );
  const sent = calls.find((c) => c.captcha_key);
  assert(
    sent?.captcha_sid === '777' && sent.captcha_key === 'q7x9',
    'the same request was repeated once with the answer'
  );
  assert(String(sent.start_message_id) === '21', 'it asked before message 21');
  // The chat's beginning: one more (empty) ask, then nothing, ever.
  await until(
    () => store.get('history:vk:7').then((link) => link?.complete === true),
    'the beginning of the chat is marked'
  );
  const asked = calls.length;
  await page.evaluate(() => {
    const box = document.querySelector('.chat-scroll');
    box.scrollTop = 0;
    box.dispatchEvent(new globalThis.Event('scroll'));
  });
  await wait(1200);
  assert(calls.length === asked, 'nothing is asked past the beginning');
};

const cancelSteps = async () => {
  await page.locator('[data-chat="vk:8"]').click();
  const dialog = page.locator('[data-dialog="vk-captcha"]');
  await dialog.waitFor({ timeout: 8000 });
  const before = calls.filter((c) => String(c.peer_id) === '8').length;
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5000 });
  await wait(1500);
  const after = calls.filter((c) => String(c.peer_id) === '8').length;
  assert(before === 1 && after === 1, 'Escape cancels; VK is not asked again');
  assert(
    (await page.locator('[data-dialog="vk-captcha"]').count()) === 0,
    'the dialog does not come back by itself'
  );
};

await finish(async () => {
  const response = await page.goto(`${base}/`);
  await page.locator('[data-chat="vk:7"]').waitFor();
  await mediaSteps(response.headers());
  await captchaSteps();
  await cancelSteps();
});
