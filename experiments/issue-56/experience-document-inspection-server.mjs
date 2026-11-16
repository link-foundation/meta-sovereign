import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { experienceDocumentBrowserFixture } from './experience-document-browser-fixture.mjs';
import { experienceDocumentInspectionCode } from './experience-document-inspect.mjs';
const fixture = await experienceDocumentBrowserFixture();
const screenshots = resolve('docs/screenshots/issue-56-experience-documents');
await mkdir(screenshots, { recursive: true });
for (const before of [true, false]) {
  await writeFile(
    `ci-logs/experience-documents-mcp-${before ? 'before' : 'after'}.js`,
    experienceDocumentInspectionCode({
      base: fixture.base,
      screenshots,
      ...(before
        ? {
            beforeBundle: resolve(
              'ci-logs/experience-documents-before-app.min.js'
            ),
          }
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
