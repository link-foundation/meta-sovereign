import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { experiencePlanBrowserFixture } from './experience-plan-browser-fixture.mjs';
import { experiencePlanInspectionCode } from './experience-plan-inspect.mjs';
import { experienceBrowserFixture } from './experience-browser-fixture.mjs';
import { cvLoadingInspectionCode } from './cv-loading-inspect.mjs';

const fixture = await experiencePlanBrowserFixture();
const loading = await experienceBrowserFixture();
const screenshots = resolve('docs/screenshots/issue-56-cv-loading');
await mkdir(screenshots, { recursive: true });
for (const before of [true, false]) {
  await writeFile(
    `ci-logs/cv-loading-mcp-${before ? 'before' : 'after'}.js`,
    cvLoadingInspectionCode({
      base: loading.base,
      before,
      screenshot: `${screenshots}/${before ? 'before' : 'after'}.png`,
    })
  );
}
await writeFile(
  'ci-logs/experience-layout-mcp.js',
  experiencePlanInspectionCode({ base: fixture.base, input: fixture.input })
);
console.log(JSON.stringify({ base: fixture.base, synthetic: true }));
await new Promise((finish) => {
  const stop = async () => {
    await fixture.close();
    await loading.close();
    finish();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
});
