import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import { overlapBandCase } from './salary-band-overlap-fixture.mjs';

await salaryDraftMcpServer(overlapBandCase);
