import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import {
  bandQuestion,
  bandChoices,
  bandSavedRule,
} from './salary-band-safety-fixture.mjs';

await salaryDraftMcpServer({
  question: bandQuestion,
  options: bandChoices,
  rules: [bandSavedRule()],
});
