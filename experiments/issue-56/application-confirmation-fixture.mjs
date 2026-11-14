import { applicationFixture } from './application-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';

/** One finite questionnaire; every continuation is explicitly invoked. */
export const confirmationApplication = async (
  t,
  options = {},
  configuration = {}
) => {
  const fixture = applicationFixture(configuration);
  t.after(() => fixture.close());
  fixture.receipt = await fixture.enter(fixture.service, {
    reviewDelayMs: 0,
    ...options,
  });
  fixture.read = async () => {
    fixture.receipt = await fixture.service['application-read'](
      applicationIdentity(fixture.receipt)
    );
    return fixture.receipt;
  };
  fixture.progress = async (step, extra = {}) => {
    fixture.receipt = await fixture.service['application-continue'](
      applicationIdentity(fixture.receipt, {
        ...(step ? { step, confirm: true } : {}),
        ...extra,
      })
    );
    return fixture.receipt;
  };
  fixture.fullForm = async () => {
    fixture.state.page.url =
      'https://hh.ru/applicant/vacancy_response?vacancyId=123';
    return fixture.read();
  };
  await fixture.fullForm();
  return fixture;
};
