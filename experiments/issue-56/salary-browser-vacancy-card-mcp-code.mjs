import { salaryDraftMcpCode } from './salary-draft-mcp-code.mjs';
import { salaryVacancyCardAnswer } from './salary-vacancy-card-fixture.mjs';
import { clarificationSalary } from './salary-clarification-fixture.mjs';

process.stdout.write(
  await salaryDraftMcpCode(
    salaryVacancyCardAnswer,
    clarificationSalary.currencies.filter(({ code }) => code === 'EUR')
  )
);
