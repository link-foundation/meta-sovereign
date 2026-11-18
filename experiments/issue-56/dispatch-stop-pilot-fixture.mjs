import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { createAutomationRunner } from '../../js/src/automation/runner.js';
import {
  createAutopilot,
  autopilotId,
} from '../../js/src/automation/autopilot.js';
import { saveSettings } from '../../js/src/automation/safety.js';
import { capAutomation, capNow } from './automatic-cap-fixture.mjs';
import { withSdkConsent } from './consent-sdk-fixture.mjs';

/** One real automatic step through the shared sender, with an offline SDK. */
export const withPilotSdkStop = async (variant, stage, check) => {
  const automation = capAutomation('sdk-stop');
  const finished = Promise.withResolvers();
  let runner;
  let pilot;
  return withSdkConsent(
    variant,
    stage,
    async (fixture) => {
      let settled = false;
      const stopping = pilot.stop(automation).then(() => {
        settled = true;
      });
      try {
        await turn();
        assert.equal(settled, false, 'Stop must drain preparation/issued work');
      } finally {
        fixture.release.resolve();
        await stopping;
      }
      const outcome = await fixture.pending;
      assert.equal(outcome.error, undefined);
      const state = await fixture.store.get(autopilotId(automation));
      assert.equal(state.on, false);
      assert.equal(state.status, 'stopped');
      assert.equal(state.current, null);
      assert.equal(state.nextAt, null);
      return check({ ...fixture, outcome: outcome.result });
    },
    {
      invoke: async ({ store, send, draft }) => {
        await saveSettings(store, { quietHours: { enabled: false } });
        await store.put(automation);
        runner = createAutomationRunner({
          store,
          send,
          clock: () => new Date(capNow),
        });
        pilot = createAutopilot({
          store,
          clock: () => new Date(capNow),
          runner: {
            load: runner.load,
            next: async () => ({ draft }),
            deliverDraft: async (...args) => {
              try {
                const result = await runner.deliverDraft(...args);
                finished.resolve(result);
                return result;
              } catch (error) {
                finished.reject(error);
                throw error;
              }
            },
          },
        });
        await pilot.start(automation);
        return finished.promise;
      },
      close: async () => {
        await pilot?.stopAll();
        await runner?.close();
      },
    }
  );
};
