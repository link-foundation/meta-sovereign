import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { salaryIntentQuestion } from './salary-intent-fixture.mjs';

await salaryDraftMcpServer({ question: salaryIntentQuestion });
