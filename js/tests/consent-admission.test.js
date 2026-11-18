import test from 'node:test';
import assert from 'node:assert/strict';
import {
  consentSources,
  withConsentAdmission,
} from '../../experiments/issue-56/consent-admission-fixture.mjs';
import {
  SETTINGS_ID,
  normalizeSettings,
  saveSettings,
} from '../src/automation/safety.js';
import {
  guardedSend,
  recoverOutbox,
  listOutbox,
} from '../src/automation/outbox.js';

for (const source of consentSources) {
  for (const scope of ['chat', 'contact']) {
    test(
      `${source} observes a ${scope} opt-out saved during durable admission`,
      { timeout: 5000 },
      async () =>
        withConsentAdmission(
          source,
          async ({ store, pending, release, effects, draft, send, logs }) => {
            await saveSettings(store, {
              optOut: [{ source, [scope]: draft[scope] }],
            });
            release.resolve();
            const result = await pending;
            assert.equal(result.status, 'failed');
            assert.equal(result.code, 'opted-out');
            assert.equal(result.outbox.status, 'failed');
            assert.equal(effects.length, 0);
            assert.equal(await recoverOutbox(store), 0);
            assert.ok(
              logs.some((entry) => entry.event === 'outbox_consent_refused')
            );
            // Explicit removal permits a separately requested send of this key.
            await saveSettings(store, { optOut: [] });
            assert.equal(
              (await guardedSend({ store, draft, send })).status,
              'sent'
            );
            assert.equal(effects.length, 1);
          },
          // An earlier caller snapshot cannot override a later saved refusal.
          scope === 'contact' ? { settings: normalizeSettings({}) } : {}
        )
    );
  }
}

test(
  'late consent changes retain provider and chat/person isolation',
  { timeout: 5000 },
  async () => {
    await withConsentAdmission(
      'telegram',
      async ({ store, pending, release, effects }) => {
        await saveSettings(store, {
          optOut: [
            { source: 'vk', chat: '201' },
            { source: 'telegram', contact: '201' },
            { source: 'telegram', chat: 'person-201' },
          ],
        });
        release.resolve();
        assert.equal((await pending).status, 'sent');
        assert.equal(effects.length, 1);
      }
    );
  }
);

for (const accepted of [true, false]) {
  test(
    `post-admission consent waits for ${accepted ? 'accepted' : 'rejected'} settings acknowledgement`,
    { timeout: 5000 },
    async () => {
      await withConsentAdmission(
        'hh',
        async ({ store, pending, release, effects }) => {
          const entered = Promise.withResolvers();
          const acknowledgement = Promise.withResolvers();
          let firstFlush = true;
          store.flush = async () => {
            if (firstFlush) {
              firstFlush = false;
              entered.resolve();
              await acknowledgement.promise;
            }
          };
          const saving = saveSettings(store, {
            optOut: [{ source: 'hh', chat: '201' }],
          });
          const saved = accepted
            ? saving
            : assert.rejects(saving, /Synthetic refusal/u);
          try {
            await entered.promise;
            release.resolve();
            for (let turn = 0; turn < 8; turn++) {
              await Promise.resolve();
            }
            assert.equal(effects.length, 0);
          } finally {
            if (accepted) {
              acknowledgement.resolve();
            } else {
              acknowledgement.reject(new Error('Synthetic refusal'));
            }
            await Promise.allSettled([pending, saved, acknowledgement.promise]);
          }
          await saved;
          const result = await pending;
          assert.equal(result.status, accepted ? 'failed' : 'sent');
          assert.equal(effects.length, accepted ? 0 : 1);
          if (accepted) {
            assert.equal(result.code, 'opted-out');
          }
        }
      );
    }
  );
}

test(
  'an unreadable fresh consent record refuses without issuing a send',
  { timeout: 5000 },
  async () => {
    await withConsentAdmission(
      'email',
      async ({ store, pending, release, effects }) => {
        const get = store.get.bind(store);
        store.get = async (id) => {
          if (id === SETTINGS_ID) {
            throw new Error('Synthetic unavailable settings');
          }
          return get(id);
        };
        release.resolve();
        const result = await pending;
        assert.equal(result.status, 'failed');
        assert.equal(result.code, 'safety-settings-unavailable');
        assert.equal(effects.length, 0);
      }
    );
  }
);

test(
  'failed refusal persistence retains the original reservation across recovery',
  { timeout: 5000 },
  async () => {
    await withConsentAdmission(
      'telegram',
      async ({ store, pending, release, effects, draft, send }) => {
        await saveSettings(store, {
          optOut: [{ source: 'telegram', chat: '201' }],
        });
        const put = store.put.bind(store);
        store.put = async (row) => {
          if (row.id.startsWith('outbox:') && row.status === 'failed') {
            throw new Error('Synthetic failed settlement');
          }
          return put(row);
        };
        release.resolve();
        assert.equal((await pending).code, 'opted-out');
        assert.equal((await listOutbox(store))[0].status, 'sending');
        assert.equal(effects.length, 0);
        assert.equal(await recoverOutbox(store), 1);
        await saveSettings(store, { optOut: [] });
        assert.equal(
          (await guardedSend({ store, draft, send })).code,
          'send-in-doubt'
        );
        assert.equal(effects.length, 0);
      }
    );
  }
);

test(
  'consent saved after an issued effect does not relabel its positive receipt',
  { timeout: 5000 },
  async () => {
    await withConsentAdmission(
      'hh',
      async ({ store, pending, release, effects, draft, send }) => {
        release.resolve();
        assert.equal((await pending).status, 'sent');
        await saveSettings(store, { optOut: [{ source: 'hh', chat: '201' }] });
        assert.equal((await listOutbox(store))[0].status, 'sent');
        assert.equal(
          (await guardedSend({ store, draft, key: 'later-request', send }))
            .code,
          'opted-out'
        );
        assert.equal(effects.length, 1);
      }
    );
  }
);
