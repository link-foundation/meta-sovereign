import test from 'node:test';
import assert from 'node:assert/strict';
import { sendText, sendError } from '../src/sources/telegram-send.js';
import { createBrowserSendConsent } from '../src/sources/browser-send-consent.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { withdrawConsent } from '../../experiments/issue-56/consent-fixture.mjs';

for (const raw of [true, false]) {
  for (const reason of ['consent', 'Stop']) {
    test(
      `Telegram ${raw ? 'raw' : 'library'} stops remaining parts after ${reason}`,
      { timeout: 5000 },
      async () => {
        const store = createMemoryStore();
        const controller = new AbortController();
        const draft = { source: 'telegram', chat: '201', text: 'abcdefghi' };
        let issued = 0;
        const accept = async () => {
          issued += 1;
          if (reason === 'consent') {
            await withdrawConsent(store, draft);
          } else {
            controller.abort();
          }
          return { className: 'UpdateShortSentMessage', id: 301 };
        };
        try {
          await assert.rejects(
            sendText({
              peer: draft.chat,
              text: draft.text,
              maxLength: 3,
              client: {
                getInputEntity: async (peer) => peer,
                ...(raw ? { invoke: accept } : { sendMessage: accept }),
              },
              Api: raw
                ? {
                    messages: {
                      SendMessage: class {
                        constructor(fields) {
                          Object.assign(this, fields);
                        }
                      },
                    },
                  }
                : {},
              beforeIssue: createBrowserSendConsent(store, draft, {
                signal: controller.signal,
              }),
            }).catch((error) => {
              throw sendError(error);
            }),
            { code: 'send-unknown', ambiguous: true, fallback: false }
          );
          assert.equal(issued, 1);
        } finally {
          await store.close?.();
        }
      }
    );
  }
}
