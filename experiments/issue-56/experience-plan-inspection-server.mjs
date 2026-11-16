import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { experiencePlanBrowserFixture } from './experience-plan-browser-fixture.mjs';
import { experiencePlanInspectionCode } from './experience-plan-inspect.mjs';

const fixture = await experiencePlanBrowserFixture();
const screenshots = resolve('docs/screenshots/issue-56-experience-plan');
await mkdir(screenshots, { recursive: true });
for (const before of [true, false]) {
  await writeFile(
    `ci-logs/experience-plan-mcp-${before ? 'before' : 'after'}.js`,
    experiencePlanInspectionCode({
      base: fixture.base,
      input: fixture.input,
      screenshots,
      ...(before
        ? { beforeBundle: resolve('ci-logs/experience-plan-before-app.min.js') }
        : {}),
    })
  );
}
console.log(JSON.stringify({ base: fixture.base, synthetic: true }));
await new Promise((finish) => {
  const stop = async () => {
    await fixture.close();
    finish();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
});
