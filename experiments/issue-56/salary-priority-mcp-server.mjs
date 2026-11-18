import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { priorityQuestion as question } from './salary-priority-fixture.mjs';

await salaryDraftMcpServer({ question });
