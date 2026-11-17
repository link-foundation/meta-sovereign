import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { mountRepeatedQuestion } from './repeated-question-fixture.mjs';

await salaryDraftMcpServer({
  question: 'Do you have distributed systems experience?',
  options: ['Yes', 'No'],
  setup: async () => ({
    prepare: (fixture) => fixture.page.evaluate(mountRepeatedQuestion),
  }),
});
