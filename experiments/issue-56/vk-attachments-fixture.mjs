import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import { importInto } from '../../js/src/sources/index.js';
import { saveVkAttachmentSettings } from '../../js/src/sources/vk-attachment-metadata.js';
import { message } from '../../js/tests/helpers/fake-vk.js';

export const photo = (id = 11, extra = {}) => ({
  type: 'photo',
  photo: {
    id,
    owner_id: 41,
    text: 'First <script>fixture</script> 元数据',
    ...extra,
  },
});
export const attachmentMessage = (id, attachments = [photo()], extra = {}) =>
  message(id, 41, `Attachment ${id}`, { attachments, ...extra });
export const attachmentArchive = (...messages) => ({
  conversations: [{ peer: { id: 41 }, messages }],
});
export const seedAttachments = async (store = createMemoryStore()) => {
  await saveVkAttachmentSettings(store, { enabled: true });
  await importInto(
    store,
    'vk',
    attachmentArchive(
      attachmentMessage(1),
      attachmentMessage(2, [
        photo(11, { text: 'Later metadata must not replace the first' }),
      ]),
      attachmentMessage(3, [
        {
          type: 'doc',
          doc: { id: 12, owner_id: -42, title: 'Document नमस्ते', size: 123 },
        },
      ]),
      attachmentMessage(4, [
        { type: 'sticker', sticker: { sticker_id: 13, product_id: 1 } },
      ]),
      attachmentMessage(5, [photo(99)], { out: 1, from_id: 1 })
    )
  );
  return store;
};
export const attachmentServer = async () => {
  const store = await seedAttachments();
  let providerEffects = 0;
  let refuseWrites = false;
  store.flush = async () => {
    if (refuseWrites) {
      throw new Error('Fixture metadata acknowledgement refused');
    }
  };
  const server = await startServer({
    store,
    port: 0,
    localUi: true,
    enableSync: false,
    enableHandlers: false,
    telegramAccount: false,
    automations: {
      scheduler: false,
      send: async () => {
        providerEffects++;
        throw new Error('Unexpected provider effect in attachment fixture');
      },
    },
    log: null,
  });
  return {
    store,
    base: `http://127.0.0.1:${server.port}`,
    effects: () => providerEffects,
    refuseWrites: (value) => {
      refuseWrites = value;
    },
    close: () => server.close(),
  };
};
