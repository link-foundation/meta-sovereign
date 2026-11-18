import { cvPrepareFixture } from './cv-prepare-fixture.mjs';
import { startCvReviewMcpFixture } from './cv-review-mcp-fixture.mjs';

const fixture = await cvPrepareFixture();
await startCvReviewMcpFixture(fixture, {
  recordId: 'jobs-cv-technology-review:jobs',
  counter: 'reviewWrites',
  available: true,
  cvPrepare: fixture.cvPrepare,
});
