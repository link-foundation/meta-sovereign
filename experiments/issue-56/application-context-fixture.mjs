import { applicationResumeFixture } from './application-resume-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';

/** Employer questions are Russian, while the matching exported CV has a Latin title. */
export const applicationContextFixture = async (t, options = {}) => {
  const fixture = await applicationResumeFixture(t, options);
  if (fixture.entered) {
    fixture.state.fields[1].label = 'Расскажите о вашем последнем опыте работы';
    fixture.entered = await fixture.service['application-read'](
      applicationIdentity(fixture.entered)
    );
  }
  return fixture;
};
