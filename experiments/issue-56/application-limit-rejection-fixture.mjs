import { createVacancyService } from '../../js/src/jobs/service.js';
import { applicationLimitId } from '../../js/src/jobs/application-limit-data.js';
import { applicationLimitWaitFixture } from './application-limit-wait-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';

/** A finite issued Send receives a native limit refusal instead of success. */
export const applicationLimitRejectionFixture = (t, options = {}) => {
  const fixture = applicationLimitWaitFixture(t, options);
  const dispatch = fixture.serviceOptions.application.dispatch;
  fixture.hooks.rejectSend = true;
  fixture.hooks.rejectAction = 'submit';
  const open = fixture.serviceOptions.openSession;
  fixture.serviceOptions.openSession = async (input) => {
    const session = await open(input);
    const goto = session.commander.goto;
    session.commander.goto = async (input) => {
      await goto(input);
      fixture.state.page.documentKey = `finite-native-document-${fixture.state.opened}`;
    };
    return session;
  };
  fixture.serviceOptions.application.dispatch = async (...args) => {
    if (args[2] === fixture.hooks.rejectAction && fixture.hooks.rejectSend) {
      if (args[2] === 'enter') {
        await dispatch(...args);
      } else {
        fixture.state.submitted++;
      }
      fixture.state.page.dailyLimit = !fixture.hooks.deferDailyLimit;
      await fixture.hooks.rejected?.();
      if (fixture.hooks.loseDispatchReply) {
        throw new Error('Finite lost dispatch reply');
      }
      return { dispatched: true };
    }
    return dispatch(...args);
  };
  fixture.service = createVacancyService(fixture.serviceOptions);
  return Object.assign(fixture, {
    reject: (receipt) =>
      fixture.service['application-advance'](
        applicationIdentity(receipt, { action: 'submit', confirm: true })
      ),
    async rejected() {
      return this.reject(await this.answered());
    },
    async waiting(restoreDraft = true) {
      return this.begin(await this.rejected(), { restoreDraft });
    },
    async restart(receipt, now = fixture.clock.value) {
      await this.service.stop();
      fixture.clock.value = now;
      this.service = createVacancyService(fixture.serviceOptions);
      return this.status(receipt);
    },
    async extendWorkspacePause(documentKey) {
      const limit = await fixture.store.get(applicationLimitId);
      await fixture.store.put({
        ...limit,
        observedAt: limit.until,
        until: new Date(Date.parse(limit.until) + 7200000).toISOString(),
        documentKey,
      });
    },
  });
};
