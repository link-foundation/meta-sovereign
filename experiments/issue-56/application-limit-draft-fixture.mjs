import { applicationDeferralFixture } from './application-deferral-fixture.mjs';
import { applicationIdentity as identity } from './application-run-fixture.mjs';

export const applicationLimitDraftFixture = (t, options = {}) => {
  const clock = { value: Date.UTC(2026, 10, 14) };
  const fixture = applicationDeferralFixture({
    ...options,
    application: { now: () => clock.value, ...options.application },
  });
  t.after(() => fixture.close());
  return Object.assign(fixture, {
    clock,
    read: (receipt) => fixture.service['application-read'](identity(receipt)),
    status: (receipt) =>
      fixture.service['application-status'](identity(receipt)),
    async limited(receipt) {
      this.state.page.dailyLimit = true;
      return this.read(receipt);
    },
  });
};
