import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { currencyBandCase } from './salary-band-currencies-fixture.mjs';

await salaryDraftMcpServer(currencyBandCase());
