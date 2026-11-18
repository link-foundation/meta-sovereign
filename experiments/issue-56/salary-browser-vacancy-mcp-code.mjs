import { salaryDraftMcpCode } from './salary-draft-mcp-code.mjs';
import { salaryVacancyAnswer } from './salary-vacancy-fixture.mjs';

process.stdout.write(await salaryDraftMcpCode(salaryVacancyAnswer));
