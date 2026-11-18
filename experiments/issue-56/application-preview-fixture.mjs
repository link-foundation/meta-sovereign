import { applicationFullFormFixture } from './application-fullform-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';
import { gate } from './vacancy-fixture.mjs';
import assert from 'node:assert/strict';

export const waitForApplicationPreview = (fixture, pending) =>
  Promise.race([
    fixture.waiting.promise,
    pending.then(() =>
      assert.fail('Entry completed without previewing the vacancy')
    ),
  ]);

/** Exercise the actual entry/full-form services at their finite preview boundary. */
export const applicationPreviewFixture = async (
  t,
  { input, block = false, afterScroll, afterWait, preview = true } = {}
) => {
  const calls = [];
  const waiting = gate();
  const release = gate();
  if (!block) {
    release.resolve();
  }
  const fixture = await applicationFullFormFixture(t, {
    input,
    application: {
      previewVacancy: async (_browser, value) => {
        calls.push({ ...value });
        if (value.scroll) {
          await afterScroll?.(fixture);
        }
        return typeof preview === 'function' ? preview(value) : preview;
      },
      previewWait: async (ms, signal) => {
        calls.push({ wait: ms });
        const abort = () => release.resolve();
        signal.addEventListener('abort', abort, { once: true });
        waiting.resolve();
        try {
          signal.throwIfAborted();
          await release.promise;
          signal.throwIfAborted();
          await afterWait?.(fixture);
        } finally {
          signal.removeEventListener('abort', abort);
        }
      },
    },
  });
  return {
    ...fixture,
    calls,
    waiting,
    release,
    advance: (action) =>
      fixture.service['application-advance'](
        applicationIdentity(fixture.opened, { action, confirm: true })
      ),
  };
};
