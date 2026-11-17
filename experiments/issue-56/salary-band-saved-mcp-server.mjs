import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { bandQuestion, bandSavedRule } from './salary-band-safety-fixture.mjs';

const options = ['USD up to 5000', 'USD 5001–7999'];
await salaryDraftMcpServer({
  question: bandQuestion,
  options,
  rules: [bandSavedRule(options[0])],
});
