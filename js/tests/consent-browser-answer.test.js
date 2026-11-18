import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSettings, SETTINGS_ID } from '../src/automation/safety.js';
import { withBrowserAnswerConsent } from '../../experiments/issue-56/consent-browser-answer-fixture.mjs';
import { withBrowserSendConsent } from '../../experiments/issue-56/consent-browser-send-fixture.mjs';

for (const mode of [
  'choice',
  'text',
  'watch-choice',
  'watch-text',
  'watch-inactive',
]) {
  for (const stage of ['open', 'document', 'arm']) {
    for (const scope of ['chat', 'contact']) {
      test(
        `${mode} refuses ${scope} withdrawn during ${stage}`,
        { timeout: 5000 },
        async () =>
          withBrowserAnswerConsent(mode, stage, async (fixture) => {
            const { store, target, pending, release, state } = fixture;
            await saveSettings(store, {
              optOut: [
                {
                  source: target.source,
                  [scope]: scope === 'chat' ? target.chat : target.to,
                },
              ],
            });
            release.resolve();
            const { error, result } = await pending;
            assert.equal(result, undefined);
            assert.equal(error?.code, 'opted-out');
            assert.equal(error.fallback, false);
            assert.equal(error.ambiguous, undefined);
            assert.equal(state.clicks, 0);
            if (stage === 'arm') {
              assert.equal(state.operations.at(-1), 'release');
            }
          })
      );
    }
  }
  test(
    `${mode} retains a positively witnessed issued reply after opt-out`,
    { timeout: 5000 },
    async () =>
      withBrowserAnswerConsent(
        mode,
        'receipt',
        async ({ store, target, pending, release, state }) => {
          await saveSettings(store, {
            optOut: [{ source: target.source, chat: target.chat }],
          });
          release.resolve();
          const { error, result } = await pending;
          assert.equal(error, undefined);
          assert.equal(result.messageId, '102');
          assert.equal(state.clicks, 1);
        }
      )
  );
  test(
    `${mode} refuses unreadable acknowledged consent before clicking`,
    { timeout: 5000 },
    async () =>
      withBrowserAnswerConsent(
        mode,
        'arm',
        async ({ store, pending, release, state }) => {
          const get = store.get.bind(store);
          store.get = (id) => {
            if (id === SETTINGS_ID) {
              throw new Error('unreadable password=private-fixture');
            }
            return get(id);
          };
          release.resolve();
          const { error } = await pending;
          assert.equal(error?.code, 'safety-settings-unavailable');
          assert.equal(error.fallback, false);
          assert.equal(error.ambiguous, undefined);
          assert.ok(!error.message.includes('private-fixture'));
          assert.equal(state.clicks, 0);
        }
      )
  );
}

for (const mode of ['watch-choice', 'watch-text', 'watch-inactive']) {
  test(
    `${mode} keeps question inspection available after consent refusal`,
    { timeout: 5000 },
    async () =>
      withBrowserAnswerConsent(
        mode,
        'arm',
        async ({ store, target, pending, release, getWatch, state }) => {
          await saveSettings(store, {
            optOut: [{ source: 'hh', chat: target.chat }],
          });
          release.resolve();
          assert.equal((await pending).error?.code, 'opted-out');
          const value = await getWatch().read({ preserveDraft: true });
          assert.equal(value.chat, target.chat);
          assert.equal(value.question.id, '101');
          assert.equal(state.clicks, 0);
        }
      )
  );
}

test(
  'plain browser consent remains bound to the original recipient after caller edits',
  { timeout: 5000 },
  async () =>
    withBrowserSendConsent(
      'vk',
      'button',
      async ({ store, draft, release, pending, effects }) => {
        const contact = draft.to;
        draft.source = 'telegram';
        draft.chat = 'other-chat';
        draft.to = 'other-person';
        await saveSettings(store, { optOut: [{ source: 'vk', contact }] });
        release.resolve();
        assert.equal((await pending).error?.code, 'opted-out');
        assert.deepEqual(effects, []);
      }
    )
);

for (const mode of [
  'choice',
  'text',
  'watch-choice',
  'watch-text',
  'watch-inactive',
]) {
  test(
    `${mode} preserves separate provider, chat and person scopes`,
    { timeout: 5000 },
    async () =>
      withBrowserAnswerConsent(
        mode,
        'arm',
        async ({ store, pending, release, state }) => {
          await saveSettings(store, {
            optOut: [
              { source: 'vk', chat: '7' },
              { source: 'hh', chat: 'person-7' },
              { source: 'hh', contact: '7' },
            ],
          });
          release.resolve();
          const { error, result } = await pending;
          assert.equal(error, undefined);
          assert.equal(result.messageId, '102');
          assert.equal(state.clicks, 1);
        }
      )
  );
}

for (const mode of [
  'choice',
  'text',
  'watch-choice',
  'watch-text',
  'watch-inactive',
]) {
  test(
    `${mode} respects Stop while reading acknowledged consent`,
    { timeout: 5000 },
    async () =>
      withBrowserAnswerConsent(
        mode,
        'arm',
        async ({ store, sender, pending, release, getWatch, state }) => {
          const entered = Promise.withResolvers();
          const resume = Promise.withResolvers();
          const get = store.get.bind(store);
          store.get = async (id) => {
            if (id === SETTINGS_ID) {
              entered.resolve();
              await resume.promise;
            }
            return get(id);
          };
          let closing;
          release.resolve();
          try {
            await Promise.race([
              entered.promise,
              pending.then(() => {
                assert.fail(
                  'Send completed without reading acknowledged consent'
                );
              }),
            ]);
            closing =
              mode === 'choice'
                ? sender.closeAnswerWatches()
                : mode === 'text'
                  ? sender.closeTextReplies()
                  : getWatch().close();
            resume.resolve();
            const { error, result } = await pending;
            assert.equal(result, undefined);
            assert.equal(
              error?.code,
              mode === 'choice'
                ? 'question-watch-unavailable'
                : mode === 'text'
                  ? 'answer-text-unavailable'
                  : 'question-watch-page-changed'
            );
            if (mode.startsWith('watch-')) {
              assert.equal(error.historyReason, 'cancelled');
            }
            assert.equal(state.clicks, 0);
          } finally {
            resume.resolve();
            await pending;
            await closing;
          }
        }
      )
  );
}
