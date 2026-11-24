import { technologyFixture } from './technology-fixture.mjs';
import { startCvReviewMcpFixture } from './cv-review-mcp-fixture.mjs';

const fixture = await technologyFixture();
await startCvReviewMcpFixture(fixture, {
  recordId: 'jobs-technology-analysis:jobs',
  counter: 'analyses',
});
