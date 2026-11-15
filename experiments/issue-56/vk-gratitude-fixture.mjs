import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import { createDefaultSender } from '../../js/src/sources/browser-sender.js';
import { createVkLive, vkMessageLink } from '../../js/src/sources/vk.js';
import { automationPresets } from '../../js/src/automation/automations.js';
import { createFakeVk } from '../../js/tests/helpers/fake-vk.js';

export const gratitudePreset = () =>
  automationPresets().find((a) => a.id === 'automation:gratitude');
export const gratitudeMessage = (id, chat, body, extra = {}) =>
  vkMessageLink({
    id,
    peer_id: Number(chat),
    from_id: Number(chat),
    text: body,
    date: Math.floor(Date.now() / 1000) - 120 + id,
    ...extra,
  });
export const seedGratitude = async (store = createMemoryStore()) => {
  for (const message of [
    gratitudeMessage(1, '41', 'Спасибо большое за поздравление!'),
    gratitudeMessage(2, '42', '', {
      attachments: [{ type: 'sticker', sticker: { sticker_id: 65091 } }],
    }),
    gratitudeMessage(3, '43', 'Спасибо', { from_id: 1, out: 1 }),
    gratitudeMessage(4, '2000000001', 'Спасибо', { from_id: 44 }),
    gratitudeMessage(5, '45', 'Спасибо, когда будет готово?'),
  ]) {
    await store.put(message);
  }
  return store;
};

export const gratitudeServer = async ({ seed = seedGratitude } = {}) => {
  const store = await seed();
  const vk = createFakeVk({ methods: { 'messages.send': () => 919 } });
  const live = createVkLive({ fetchImpl: vk.fetchImpl, baseUrl: vk.baseUrl });
  const send = createDefaultSender({
    getSource: () => ({ live }),
    options: { vk: { token: 'fixture-vk-token' } },
  });
  const receipts = [];
  const server = await startServer({
    store,
    port: 0,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: {
      scheduler: false,
      send: async (draft) => {
        const receipt = await send(draft);
        receipts.push(receipt);
        return receipt;
      },
      sleep: async () => {},
    },
    log: null,
  });
  return {
    store,
    vk,
    receipts,
    base: `http://127.0.0.1:${server.port}`,
    close: async () => {
      await server.close();
      await send.close();
    },
  };
};
