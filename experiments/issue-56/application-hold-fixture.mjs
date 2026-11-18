import assert from 'node:assert/strict';
import { applicationFixture } from './application-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';

export const readHeldApplication = (fixture, receipt) =>
  fixture.service['application-read'](applicationIdentity(receipt));
export const prefillHeldApplication = (fixture, receipt) =>
  fixture.service['application-prefill'](
    applicationIdentity(receipt, { confirm: true })
  );
export const submitHeldApplication = (fixture, receipt, extra = {}) =>
  fixture.service['application-advance'](
    applicationIdentity(receipt, { action: 'submit', confirm: true, ...extra })
  );
export const ownHeldApplication = async (t, options = {}) => {
  const fixture = applicationFixture(options);
  t.after(() => fixture.close());
  const receipt = await fixture.enter(fixture.service, {
    autoExact: true,
    reviewDelayMs: 0,
  });
  return { fixture, receipt };
};

/** Both native refusal classes must retain the same uncertain-send reservation. */
export const verifyUncertainHold = async (t, property, value, state) => {
  const fixture = applicationFixture({
    application: {
      dispatch: async (_handle, _record, action) => {
        if (action === 'enter') {
          fixture.state.page.enter = null;
          fixture.state.page.submit = {
            qa: 'vacancy-response-letter-submit',
            disabled: false,
          };
          fixture.state.page.scope = true;
          fixture.state.page.questions = true;
          fixture.state.page.fieldIndices = [1];
        } else {
          fixture.state.page[property] = value;
        }
        return { dispatched: true };
      },
    },
  });
  t.after(() => fixture.close());
  let receipt = await fixture.enter();
  receipt = await submitHeldApplication(fixture, receipt);
  assert.equal(receipt.state, state);
  assert.equal(receipt.delivery, 'unknown');
  assert.equal(receipt.attempted.submit, true);
  fixture.state.page[property] = property === 'error' ? null : false;
  receipt = await readHeldApplication(fixture, receipt);
  assert.equal(receipt.delivery, 'unknown');
  await assert.rejects(submitHeldApplication(fixture, receipt), {
    code: 'jobs-application-already-attempted',
  });
};
