/**
 * Preview who would be greeted, and with what (issue #35).
 *
 * Seeds an in-memory store with a few chats and prints both plans:
 * `initiate` (chats never written to, oldest first) and `reply`
 * (unanswered greetings). Nothing is sent. With a real store, the same
 * plan is what `meta-sovereign greetings-send` would deliver.
 *
 *   node examples/greetings-preview.mjs
 */

import { buildMessageLink } from '../js/src/sources/link.js';
import { createMemoryStore } from '../js/src/storage/index.js';
import { planFromStore } from '../js/src/greetings/plan.js';

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const store = createMemoryStore();
for (const [source, chat, body, hours] of [
  ['vk', '100', 'Ok', 500],
  ['vk', '200', 'Спасибо', 900],
  ['telegram', '77', 'Привет!', 1],
  ['whatsapp', '1555', 'Hello', 30],
  ['x', '42', 'hi there', 2],
]) {
  await store.put(
    buildMessageLink({
      source,
      externalId: `${source}-${chat}`,
      chat,
      sender: chat,
      body,
      timestamp: hoursAgo(hours),
    })
  );
}

const describe = (envelope) =>
  envelope.skipped
    ? `skipped: ${envelope.skipped}`
    : envelope.sticker
      ? `sticker ${envelope.sticker.id} ${envelope.sticker.previewUrl ?? ''}`
      : `text "${envelope.text}"`;

for (const mode of ['initiate', 'reply']) {
  const plan = await planFromStore(store, { mode, random: () => 0 });
  console.log(`\n${mode}:`);
  for (const envelope of plan.envelopes) {
    console.log(
      `  ${envelope.network}:${envelope.chat} [${envelope.language}] ${describe(envelope)}`
    );
  }
}
