import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { salaryVacancyQuestion as question } from './salary-vacancy-fixture.mjs';
import {
  salaryVacancyBrowserReader,
  mountSalaryVacancy,
} from './salary-vacancy-browser-fixture.mjs';

await salaryDraftMcpServer({
  question,
  setup: (browser) => {
    const reader = salaryVacancyBrowserReader(browser);
    return {
      fixtureOptions: { readVacancy: reader.readVacancy },
      prepare: mountSalaryVacancy,
      stats: () => ({ reads: reader.records }),
    };
  },
});
