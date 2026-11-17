import { salaryDraftMcpCode } from './salary-draft-mcp-code.mjs';
import { employerSalaryAnswer } from './salary-employer-context-fixture.mjs';
import { clarificationSalary } from './salary-clarification-fixture.mjs';

process.stdout.write(
  await salaryDraftMcpCode(
    employerSalaryAnswer,
    clarificationSalary.currencies.filter(({ code }) => code === 'EUR')
  )
);
