import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { salaryVacancyQuestion as question } from './salary-vacancy-fixture.mjs';
import { mountSalaryVacancyCard } from './salary-vacancy-card-fixture.mjs';
import { salaryVacancyMcpSetup } from './salary-vacancy-browser-fixture.mjs';

await salaryDraftMcpServer({
  question,
  setup: (browser) => salaryVacancyMcpSetup(browser, mountSalaryVacancyCard),
});
