import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import {
  salaryTemplateQuestion as question,
  salaryTemplateRule,
} from './salary-template-context-fixture.mjs';

await salaryDraftMcpServer({ question, rules: [salaryTemplateRule()] });
