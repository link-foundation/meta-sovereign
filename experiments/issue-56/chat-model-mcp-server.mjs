// Isolated memory-only production server; the first synthetic model call refuses.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../js/src/server/index.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { seedChatModel } from './chat-model-fixture.mjs';

const store = createMemoryStore();
const fixture = await seedChatModel(store, { split: false });
const dir = await mkdtemp(path.join(os.tmpdir(), 'chat-model-mcp-'));
const sent = [];
let issued = 0;
const server = await startServer({
  store,
  storeDir: dir,
  localUi: true,
  enableSync: false,
  enableHandlers: false,
  telegramAccount: false,
  log: null,
  automations: {
    scheduler: false,
    send: async (draft) => {
      sent.push(draft);
      return { via: 'fixture' };
    },
  },
  answerModel: {
    draft: async (input) => {
      issued++;
      if (issued === 1) {
        throw Object.assign(new Error('Synthetic model refusal'), {
          code: 'answer-model-unavailable',
        });
      }
      return fixture.runner(input);
    },
    stop: async () => {},
  },
});
console.log(`http://127.0.0.1:${server.port}/#/automation`);
let closing = false;
const stop = async () => {
  if (closing) {
    return;
  }
  closing = true;
  await server.close();
  await rm(dir, { recursive: true, force: true });
  console.log(
    JSON.stringify({
      issued,
      modelCalls: fixture.calls.length,
      sends: sent.length,
    })
  );
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
