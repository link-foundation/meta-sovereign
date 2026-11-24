import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import {
  salaryPhrasingQuestion,
  salaryNumberQuestion,
  salaryAnchor,
} from './salary-clarification-fixture.mjs';

await salaryDraftMcpServer({
  recent: [salaryAnchor],
  question:
    process.env.SALARY_NUMBERS === '1'
      ? salaryNumberQuestion
      : salaryPhrasingQuestion,
});
