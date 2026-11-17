import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import {
  employerSalaryQuestion as question,
  mountEmployerSalary as prepare,
} from './salary-employer-context-fixture.mjs';

await salaryDraftMcpServer({ question, setup: () => ({ prepare }) });
