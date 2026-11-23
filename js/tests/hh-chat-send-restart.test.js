import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cliServerClient } from '../src/cli/server-lino-client.js';
import { startServer } from '../src/server/index.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';

const message = {
  source: 'hh',
  chat: '7',
  id: 'msg:hh:7:101',
  tokens: ['message', 'hh', '7'],
  sender: 'employer',
  body: 'Can you bring the documents?',
  via: 'browser',
};
const draft = {
  source: 'hh',
  chat: '7',
  text: 'I will bring my documents on Friday.',
  hhBrowserMessage: message.id,
  clientId: 'reviewed-hh-reply',
};

const withRestart = async (verify, { onIssue, configureStore } = {}) => {
  const folder = await mkdtemp(join(tmpdir(), 'ms-hh-send-restart-'));
  const file = join(folder, 'messages.lino');
  const attempts = [];
  let server;
  let store;
  const close = async () => {
    await server?.close();
    server = null;
    await store?.close();
    store = null;
  };
  const reopen = async () => {
    await close();
    store = await createLinoTextStore(file);
    configureStore?.(store);
    server = await startServer({
      store,
      storeDir: folder,
      telegramAccount: false,
      enableSync: false,
      enableHandlers: false,
      automations: {
        scheduler: false,
        send: async ({ chat, text }) => {
          attempts.push({ chat, text });
          await onIssue?.();
          return {
            via: 'browser',
            link: {
              ...message,
              id: 'msg:hh:7:102',
              sender: 'me',
              outgoing: true,
              body: text,
              delivery: 'delivered',
            },
          };
        },
      },
    });
    return store;
  };
  const send = async (input = draft, binary = false) => {
    const request = cliServerClient(`http://127.0.0.1:${server.port}`, binary);
    const path = '/api/send';
    const preview = await request(path, input);
    assert.equal(preview.status, 428);
    assert.equal(preview.answer.preview.text, input.text);
    return request(path, {
      ...input,
      confirmToken: preview.answer.confirm.token,
    });
  };
  try {
    await reopen();
    await store.put(message);
    await verify({ send, reopen, attempts, store });
  } finally {
    await close();
    await rm(folder, { recursive: true, force: true });
  }
};

test(
  'a confirmed HeadHunter message keeps its receipt and send ID after reopening the store',
  { timeout: 15000 },
  async () => {
    await withRestart(async ({ send, reopen, attempts, store }) => {
      const [first, concurrent] = await Promise.all([
        send(),
        send(draft, true),
      ]);
      assert.equal(first.status, 200);
      assert.equal(concurrent.status, 200);
      assert.equal(first.answer.link?.delivery, 'delivered');
      assert.equal(concurrent.answer.link?.id, first.answer.link.id);
      const [receipt] = await store.query(
        (link) => link.tokens?.[0] === 'chat-send'
      );
      assert.equal(receipt?.state, 'sent');
      assert.equal(JSON.stringify(receipt).includes(draft.text), false);
      await reopen();
      const retry = await send(draft, true);
      assert.equal(retry.status, 200);
      assert.equal(retry.answer.link?.id, first.answer.link.id);
      assert.equal(retry.answer.link?.delivery, 'delivered');
      assert.equal(attempts.length, 1);
      const conflict = await send({ ...draft, text: 'I will come on Monday.' });
      assert.equal(conflict.status, 409);
      assert.equal(conflict.answer.code, 'send-id-conflict');
      assert.equal(attempts.length, 1);
    });
  }
);

test(
  'an uncertain HeadHunter message stays uncertain after reopening the store',
  { timeout: 15000 },
  async () => {
    await withRestart(
      async ({ send, reopen, attempts }) => {
        assert.equal((await send()).answer.code, 'send-unknown');
        await reopen();
        assert.equal((await send(draft, true)).answer.code, 'send-unknown');
        assert.equal(attempts.length, 1);
      },
      {
        onIssue: () => {
          throw Object.assign(
            new Error('HeadHunter did not confirm delivery.'),
            {
              code: 'send-unknown',
              ambiguous: true,
            }
          );
        },
      }
    );
  }
);

test(
  'the server flushes a reservation before dispatch and permits a definite retry',
  { timeout: 15000 },
  async () => {
    let reservationWritable = true;
    let flushes = 0;
    await withRestart(
      async ({ send, attempts, store }) => {
        const unavailable = await send();
        assert.equal(unavailable.answer.code, 'outbox-unavailable');
        assert.equal(attempts.length, 0);
        reservationWritable = true;
        await store.delete(message.id);
        assert.equal((await send()).answer.code, 'unsupported-target');
        assert.equal(attempts.length, 0);
        const [pending] = await store.query(
          (link) => link.tokens?.[0] === 'chat-send'
        );
        assert.equal(pending, undefined);
        await store.put(message);
        assert.equal((await send()).answer.status, 'sent');
        assert.equal(attempts.length, 1);
      },
      {
        configureStore: (store) => {
          reservationWritable = false;
          store.flushLog = async () => {
            if (!reservationWritable) {
              throw new Error('The log is unavailable');
            }
            await store.flush();
            flushes++;
          };
        },
        onIssue: () => assert.equal(flushes, 3),
      }
    );
  }
);

test(
  'a lost local receipt write preserves the accepted result and blocks redispatch on reopen',
  { timeout: 15000 },
  async () => {
    await withRestart(
      async ({ send, reopen, attempts }) => {
        const first = await send();
        assert.equal(first.answer.link?.delivery, 'delivered');
        const store = await reopen();
        assert.equal(
          (await store.get(first.answer.link.id))?.delivery,
          'delivered'
        );
        assert.equal((await send(draft, true)).answer.code, 'send-unknown');
        assert.equal(attempts.length, 1);
      },
      {
        configureStore: (store) => {
          const update = store.update.bind(store);
          store.update = (id, change, options) =>
            update(
              id,
              (previous) => {
                const next = change(previous);
                if (next.tokens?.[0] === 'chat-send' && next.state === 'sent') {
                  throw new Error('The receipt could not be committed');
                }
                return next;
              },
              options
            );
        },
      }
    );
  }
);
