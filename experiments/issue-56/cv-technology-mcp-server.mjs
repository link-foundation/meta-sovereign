import { cvTechnologyFixture } from './cv-technology-fixture.mjs';
import { startCvReviewMcpFixture } from './cv-review-mcp-fixture.mjs';

const fixture = await cvTechnologyFixture();
await startCvReviewMcpFixture(fixture, {
  recordId: 'jobs-cv-technology-review:jobs',
  counter: 'reviewWrites',
});
