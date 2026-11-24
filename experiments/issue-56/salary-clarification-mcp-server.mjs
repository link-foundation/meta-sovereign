import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { salaryClarification } from './salary-clarification-fixture.mjs';

await salaryDraftMcpServer({ question: salaryClarification });
