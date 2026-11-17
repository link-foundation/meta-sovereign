import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { salaryPhrasingQuestion } from './salary-clarification-fixture.mjs';

await salaryDraftMcpServer({ question: salaryPhrasingQuestion });
