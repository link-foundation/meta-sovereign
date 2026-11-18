import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createDefaultSender } from '../../js/src/sources/browser-sender.js';
import { createVkLive } from '../../js/src/sources/vk.js';
import { createTelegramAccount } from '../../js/src/sources/telegram-account.js';
import { createTelegramBotLive } from '../../js/src/sources/telegram.js';
import { createWhatsAppCloudLive } from '../../js/src/sources/whatsapp.js';
import { createEmailLive } from '../../js/src/sources/email-live.js';
import { consentBarrier, consentOutcome } from './consent-fixture.mjs';
import { smtpConsentFixture } from './consent-smtp-fixture.mjs';

const jsonReply = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const vkFixture = (variant, wait, effects) => {
  let attempts = 0;
  return {
    live: createVkLive({
      token: 'fixture',
      limiter: {
        wait: async () => variant === 'vk-limiter' && wait('prepare'),
      },
      sleep: async () => wait('prepare'),
      fetchImpl: async () => {
        if (variant === 'vk-retry' && attempts++ === 0) {
          return jsonReply({
            error: { error_code: 6, error_msg: 'Rate limit' },
          });
        }
        effects.push('api');
        await wait('issued');
        return jsonReply({ response: 301 });
      },
    }),
  };
};

const telegramFixture = async (variant, store, wait, effects) => {
  for (const [key, value] of Object.entries({
    'user-session': 'fixture',
    'api-id': '123',
    'api-hash': 'fixture',
  })) {
    await store.put({ id: `secret:telegram:${key}`, tokens: [], value });
  }
  let closed = 0;
  const issued = async () => {
    effects.push('api');
    await wait('issued');
    return { className: 'UpdateShortSentMessage', id: 301 };
  };
  const client = {
    connect: async () => variant === 'telegram-open' && wait('prepare'),
    disconnect: async () => {
      closed += 1;
    },
    getMe: async () => ({ id: 1, self: true }),
    getInputEntity: async (peer) => {
      await wait('prepare');
      return peer;
    },
    sendMessage: issued,
    ...(variant === 'telegram-library' ? {} : { invoke: issued }),
  };
  const account = createTelegramAccount({
    store,
    clientFactory: async () => client,
    importer: async () => ({
      Api: {
        messages: {
          SendMessage: class {
            constructor(fields) {
              Object.assign(this, fields);
            }
          },
        },
      },
    }),
    pollMs: 0,
    backfillMs: 0,
  });
  return {
    live: account.live,
    options:
      variant === 'telegram-library'
        ? { beforeIssue: () => wait('prepare') }
        : {},
    close: async () => {
      await account.stop();
      assert.equal(closed, 1);
    },
  };
};

const emailFixture = (variant, wait, effects) => {
  const protocol =
    variant === 'email-graph'
      ? 'microsoft-graph'
      : variant === 'email-gmail'
        ? 'gmail'
        : 'jmap';
  return {
    live: createEmailLive({
      protocol,
      token: 'fixture',
      baseUrl: 'https://mail.test',
      fetchImpl: async (url, init) => {
        if (String(url).endsWith('/.well-known/jmap')) {
          if (variant === 'email-session') {
            await wait('prepare');
          }
          return jsonReply({
            apiUrl: 'https://mail.test/api',
            primaryAccounts: { 'urn:ietf:params:jmap:mail': 'account' },
          });
        }
        if (
          protocol === 'jmap' &&
          JSON.parse(init.body).methodCalls[0][0] === 'Mailbox/get'
        ) {
          await wait('prepare');
          return jsonReply({
            methodResponses: [
              ['Mailbox/get', { list: [{ id: 'd', role: 'drafts' }] }, 'm'],
              [
                'Identity/get',
                { list: [{ id: 'i', email: 'a@example.test' }] },
                'i',
              ],
            ],
          });
        }
        effects.push('api');
        await wait('issued');
        return jsonReply(
          protocol === 'jmap' ? { methodResponses: [] } : { id: '301' }
        );
      },
    }),
    options: {
      lookup: {
        thread: async () => {
          if (protocol !== 'jmap') {
            await wait('prepare');
          }
          return null;
        },
      },
    },
  };
};

const directFixture = (variant, wait, effects) => {
  const fetchImpl = async () => {
    effects.push('api');
    await wait('issued');
    return jsonReply(
      variant === 'telegram-bot'
        ? { ok: true, result: { message_id: 301, chat: { id: 201 } } }
        : { messages: [{ id: '301' }] }
    );
  };
  return {
    live:
      variant === 'telegram-bot'
        ? createTelegramBotLive({ token: 'fixture', fetchImpl })
        : createWhatsAppCloudLive({
            token: 'fixture',
            phoneNumberId: '1',
            fetchImpl,
          }),
    options: { beforeIssue: () => wait('prepare') },
  };
};

export const sdkVariants = [
  'vk-limiter',
  'vk-retry',
  'telegram-open',
  'telegram-entity',
  'telegram-library',
  'telegram-bot',
  'whatsapp-cloud',
  'email-session',
  'email-boxes',
  'email-gmail',
  'email-graph',
  'email-smtp-greeting',
  'email-smtp-recipient',
  'email-smtp-data',
];

/** Exercise real adapters and shared dispatch, with finite offline waits. */
export const withSdkConsent = async (variant, stage, check) => {
  const store = createMemoryStore();
  const { entered, release, wait } = consentBarrier(stage);
  const effects = [];
  const source = variant.split('-')[0];
  const factory =
    source === 'vk'
      ? vkFixture
      : source === 'email'
        ? emailFixture
        : directFixture;
  const adapter = variant.startsWith('email-smtp-')
    ? await smtpConsentFixture(variant, wait, effects)
    : source === 'telegram' && !variant.endsWith('-bot')
      ? await telegramFixture(variant, store, wait, effects)
      : factory(variant, wait, effects);
  const draft = {
    source,
    chat: '201',
    contact: source === 'email' ? 'b@example.test' : 'person-201',
    text: 'Review',
  };
  const send = createDefaultSender({
    store,
    getSource: () => ({ live: adapter.live }),
    options: { [source]: adapter.options ?? {} },
    browser: {
      close: async () => {},
      send: async () => {
        effects.push('browser');
        return {};
      },
    },
  });
  const pending = consentOutcome(send(draft));
  try {
    await Promise.race([
      entered.promise,
      pending.then(() => {
        assert.fail('Adapter completed without the expected SDK wait');
      }),
    ]);
    return await check({ store, draft, release, pending, effects });
  } finally {
    release.resolve();
    await pending;
    await send.close();
    await adapter.close?.();
    await store.close?.();
  }
};
