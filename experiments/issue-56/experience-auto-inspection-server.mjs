import { writeFile } from 'node:fs/promises';
import { experienceAutoBrowserFixture } from './experience-auto-browser-fixture.mjs';
import {
  experienceAutoInspectionConfig,
  inspectExperienceAuto,
} from './experience-auto-inspect.mjs';
import { waitForCvFixtureShutdown } from './cv-fixture-server.mjs';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';

const fixture = await experienceAutoBrowserFixture();
try {
  await writeFile(
    process.argv[2],
    mcpInspectionCode(
      inspectExperienceAuto,
      experienceAutoInspectionConfig({
        base: fixture.base,
        input: fixture.input,
      })
    )
  );
  await waitForCvFixtureShutdown(fixture);
} catch (error) {
  await fixture.close();
  throw error;
}
