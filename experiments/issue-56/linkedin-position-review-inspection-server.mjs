import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { waitForCvFixtureShutdown } from './cv-fixture-server.mjs';
import { linkedinPositionReviewBrowserFixture } from './linkedin-position-review-browser-fixture.mjs';
import { linkedinPositionReviewInspectionCode } from './linkedin-position-review-inspect.mjs';

const fixture = await linkedinPositionReviewBrowserFixture();
const { base, planRequestId } = fixture;
const screenshots = resolve('docs/screenshots/issue-56-linkedin-position');
const beforeBundle = process.argv[2];
await mkdir(screenshots, { recursive: true });
await mkdir('ci-logs', { recursive: true });
for (const [variant, extra] of [
  ['before', { beforeBundle }],
  ['after', {}],
]) {
  await writeFile(
    `ci-logs/linkedin-position-mcp-${variant}.js`,
    linkedinPositionReviewInspectionCode({
      base,
      planRequestId,
      screenshots,
      ...extra,
    })
  );
}
await waitForCvFixtureShutdown(fixture);
