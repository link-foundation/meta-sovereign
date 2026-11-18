import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { linkedinExperienceBrowserFixture } from './linkedin-experience-browser-fixture.mjs';
import { linkedinExperienceInspectionCode } from './linkedin-experience-inspect.mjs';
const fixture = await linkedinExperienceBrowserFixture();
const screenshots = resolve('docs/screenshots/issue-56-linkedin-experience');
await mkdir(screenshots, { recursive: true });
for (const before of [true, false]) {
  await writeFile(
    `ci-logs/linkedin-export-mcp-${before ? 'before' : 'after'}.js`,
    linkedinExperienceInspectionCode({
      base: fixture.base,
      screenshots,
      ...(before
        ? { beforeBundle: resolve('ci-logs/linkedin-export-before-app.min.js') }
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
