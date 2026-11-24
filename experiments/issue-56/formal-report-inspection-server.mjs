import { waitForCvFixtureShutdown } from './cv-fixture-server.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formalReportBrowserFixture } from './formal-report-browser-fixture.mjs';
import { formalReportInspectionCode } from './formal-report-inspect.mjs';

const fixture = await formalReportBrowserFixture();
const screenshots = resolve('docs/screenshots/issue-56-formal-report');
await mkdir(screenshots, { recursive: true });
for (const before of [true, false]) {
  await writeFile(
    `ci-logs/formal-report-mcp-${before ? 'before' : 'after'}.js`,
    formalReportInspectionCode({
      base: fixture.base,
      planRequestId: fixture.planRequestId,
      screenshots,
      ...(before
        ? { beforeBundle: resolve('ci-logs/formal-report-before-app.min.js') }
        : {}),
    })
  );
}
await waitForCvFixtureShutdown(fixture);
