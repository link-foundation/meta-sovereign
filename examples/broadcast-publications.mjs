// Real adapters, fake credentials and responses: no provider writes or network.
import assert from 'node:assert/strict';
import { createVkLive } from '../js/src/sources/vk.js';
import { createTelegramBotLive } from '../js/src/sources/telegram.js';

const fetchImpl = async (url) => {
  const method = new URL(url).pathname.split('/').at(-1);
  const payload = method.startsWith('wall.')
    ? { response: method === 'wall.post' ? { post_id: 71 } : 1 }
    : {
        ok: true,
        result:
          method === 'sendMessage'
            ? { message_id: 72, chat: { id: -10042 } }
            : true,
      };
  return new globalThis.Response(JSON.stringify(payload));
};
const vk = createVkLive({
  token: 'example-user-token',
  fetchImpl,
  limiter: { wait: async () => {} },
});
const wallReceipt = await vk.publishPost({
  ownerId: '-42',
  text: 'Community announcement',
  clientId: 'example-draft-1',
});
assert.equal((await vk.deletePost(wallReceipt)).deleted, true);
const telegram = createTelegramBotLive({
  token: 'example-bot-token',
  fetchImpl,
});
const messageReceipt = await telegram.publishPost({
  chat: '-10042',
  text: '<b>Channel announcement</b>',
  format: 'html',
});
assert.equal((await telegram.deletePost(messageReceipt)).deleted, true);
console.log(
  'PASS: VK wall and Telegram publication/deletion receipts (mock transport)'
);
