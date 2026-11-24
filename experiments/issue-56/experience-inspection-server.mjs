import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { experienceBrowserFixture } from './experience-browser-fixture.mjs';
import { experienceInspectionCode } from './experience-inspect.mjs';

const fixture = await experienceBrowserFixture();
const screenshots = resolve('docs/screenshots/issue-56-experience');
await mkdir(screenshots, { recursive: true });
for (const before of [true, false]) {
  await writeFile(
    `ci-logs/experience-mcp-${before ? 'before' : 'after'}.js`,
    experienceInspectionCode({
      base: fixture.base,
      screenshots,
      ...(before
        ? { beforeBundle: resolve('ci-logs/experience-before-app.min.js') }
        : {}),
    })
  );
}
console.log(
  JSON.stringify({
    base: fixture.base,
    fixture: 'synthetic experience snapshots',
  })
);
await new Promise((finish) => {
  const stop = async () => {
    await fixture.close();
    finish();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
});
