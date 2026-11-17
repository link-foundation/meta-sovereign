import {
  applicationBatchFixture,
  batchUrls,
} from './application-batch-fixture.mjs';
import { vacancySnapshotFixture } from './vacancy-fixture.mjs';
import { applicationSalary } from './application-salary-fixture.mjs';

export const salaryBatchFixture = (
  t,
  salaries = ['от 400000 ₽', 'от 600000 ₽']
) => {
  const fixture = applicationBatchFixture(t, {
    vacancy: () => ({
      ...vacancySnapshotFixture(),
      salary: salaries[batchUrls.indexOf(fixture.state.page.url)] ?? '',
    }),
  });
  const start = fixture.start;
  fixture.start = (input) =>
    start({ salary: applicationSalary, confirmations: ['send'], ...input });
  return fixture;
};
