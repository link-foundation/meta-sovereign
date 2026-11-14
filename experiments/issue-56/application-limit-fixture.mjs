import { applicationFixture } from './application-fixture.mjs';
import { applicationIdentity as identity } from './application-run-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';

export const applicationLimitFixture = (t, options = {}) => {
  const clock = { value: Date.UTC(2026, 10, 14) };
  const fixture = applicationFixture({
    ...options,
    application: { now: () => clock.value, ...options.application },
  });
  t.after(async () => {
    await fixture.service.stop();
    await fixture.close();
  });
  return Object.assign(fixture, {
    clock,
    async limited() {
      let receipt = await this.enter(this.service);
      this.state.page.dailyLimit = true;
      receipt = await this.service['application-read'](identity(receipt));
      return receipt;
    },
    async restart() {
      await this.service.stop();
      this.service = createVacancyService(this.serviceOptions);
    },
  });
};
