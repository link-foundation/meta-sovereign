import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import {
  salaryWordingQuestion,
  salaryWordingRule,
} from './salary-wording-fixture.mjs';

await salaryDraftMcpServer({
  question: salaryWordingQuestion,
  rules: [salaryWordingRule()],
});
