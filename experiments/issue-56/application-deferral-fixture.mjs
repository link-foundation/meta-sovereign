import { applicationDraftFixture } from './application-draft-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';
import { createMemoryStore } from '../../js/src/storage/universal.js';

export { applicationIdentity as identity };
export const applicationDeferralFixture = (options = {}) => {
  const fixture = applicationDraftFixture(options);
  return Object.assign(fixture, {
    async answered() {
      const receipt = await fixture.enter();
      fixture.state.fields[1].value = 'Owner recent storage work.';
      fixture.state.fields[2].value = 'Owner edited cover letter.';
      return fixture.service['application-read'](applicationIdentity(receipt));
    },
    defer: (receipt) =>
      fixture.service['application-defer'](
        applicationIdentity(receipt, { confirm: true })
      ),
    queue: (browserSlot = 'jobs') =>
      fixture.service['application-queue']({ browserSlot }),
    retry: (entry, extra = {}) =>
      fixture.service['application-retry']({
        ...applicationIdentity(entry),
        queueId: entry.id,
        confirm: true,
        ...extra,
      }),
  });
};

/** Each finite refusal fires once, permitting normal acknowledged rollback. */
export const deferralStorageFault = () => {
  const memory = createMemoryStore();
  const state = { stage: null, kind: null, last: null, hits: 0, hook: null };
  const kind = (row) =>
    row.id.startsWith('qa-rule:')
      ? 'learning'
      : row.id.startsWith('secret:jobs-application-answers:')
        ? 'answers'
        : 'draft';
  const check = (stage, row) => {
    if (state.stage === stage && state.kind === kind(row)) {
      state.stage = null;
      state.hits++;
      throw Object.assign(new Error('Finite deferral checkpoint refusal'), {
        code: 'fixture-deferral-save',
      });
    }
  };
  return {
    state,
    memory,
    store: {
      ...memory,
      put: async (row) => {
        state.last = row;
        await memory.put(row);
        await state.hook?.(row);
        check('put', row);
      },
      flush: async () => check('flush', state.last),
    },
  };
};
