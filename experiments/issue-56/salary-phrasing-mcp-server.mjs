import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import {
  salaryPhrasingQuestion,
  salaryNumberQuestion,
} from './salary-clarification-fixture.mjs';

await salaryDraftMcpServer({
  question:
    process.env.SALARY_NUMBERS === '1'
      ? salaryNumberQuestion
      : salaryPhrasingQuestion,
});
