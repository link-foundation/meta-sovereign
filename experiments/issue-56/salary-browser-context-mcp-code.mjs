import { salaryDraftMcpCode } from './salary-draft-mcp-code.mjs';
import { salaryPhrasingAnswer } from './salary-clarification-fixture.mjs';

process.stdout.write(await salaryDraftMcpCode(salaryPhrasingAnswer));
