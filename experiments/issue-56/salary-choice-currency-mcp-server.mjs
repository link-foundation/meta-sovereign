import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { choiceCurrencyCase } from './salary-choice-currency-fixture.mjs';

await salaryDraftMcpServer(choiceCurrencyCase);
