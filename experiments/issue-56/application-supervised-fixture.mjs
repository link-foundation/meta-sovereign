import { applicationFixture } from './application-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';

export const supervisedOptions = {
  supervised: true,
  autoExact: true,
  coverLetter: 'Owner reviewed supervised letter.',
  reviewDelayMs: 0,
};

/** Finite native form controls shared by staged-review regression cases. */
export const supervisedApplication = async (t, options = {}) => {
  const fixture = applicationFixture(options);
  t.after(() => fixture.close());
  fixture.receipt = await fixture.enter(fixture.service, supervisedOptions);
  fixture.fill = async (part, extra = {}) => {
    fixture.receipt = await fixture.service['application-prefill'](
      applicationIdentity(fixture.receipt, { part, confirm: true, ...extra })
    );
    return fixture.receipt;
  };
  return fixture;
};
