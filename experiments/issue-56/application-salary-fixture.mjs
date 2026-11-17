import { applicationDraftFixture } from './application-draft-fixture.mjs';
import { vacancySnapshotFixture } from './vacancy-fixture.mjs';
import { applicationFormUrl } from './application-recovery-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { ladderSalary } from './salary-ladder-fixture.mjs';

export const applicationSalary = { ...ladderSalary, exchange: undefined };
export const salaryApplicationFixture = async (
  t,
  salaryText = 'до 200000 ₽'
) => {
  const f = applicationDraftFixture();
  await f.service.stop();
  f.state.salaryText = salaryText;
  f.state.contextVisits = [];
  f.state.clock = Date.now();
  f.serviceOptions.application.now = () => f.state.clock;
  const open = f.serviceOptions.openSession;
  f.serviceOptions.openSession = async (input) => {
    const browser = await open(input);
    browser.commander.evaluate = async () => {
      await f.onVacancy?.();
      return { ...vacancySnapshotFixture(), salary: f.state.salaryText };
    };
    const goto = browser.commander.goto;
    browser.commander.goto = async (input) => {
      f.state.contextVisits.push(input.url);
      await f.onGoto?.(input.url);
      await goto(input);
      if (input.url === applicationFormUrl && !f.state.directSeeded) {
        f.state.directSeeded = true;
        f.state.fields[1].value = 'Actual owner experience';
        f.state.fields[2].value = 'Actual owner letter';
      }
    };
    return browser;
  };
  f.service = createVacancyService(f.serviceOptions);
  t.after(() => f.close());
  return f;
};
