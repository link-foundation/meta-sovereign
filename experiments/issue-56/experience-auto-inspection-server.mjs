import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { experienceAutoBrowserFixture } from './experience-auto-browser-fixture.mjs';
import {
  experienceAutoInspectionConfig,
  inspectExperienceAuto,
  inspectExperienceAutoResume,
} from './experience-auto-inspect.mjs';
import {
  cvFixtureRequest,
  waitForCvFixtureShutdown,
} from './cv-fixture-server.mjs';
import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { LINO_TEXT } from '../../js/src/transport/lino.js';

const interruptedPreparation = async (fixture) => {
  const requestId = 'experience-auto-mcp-recovery';
  const send = cvFixtureRequest(`${fixture.base}/api/cv/experience/`, [
    'auto-status',
  ]);
  const { response } = await send('auto-start', LINO_TEXT, {
    ...fixture.input,
    requestId,
  });
  if (!response.ok) {
    throw new Error('Unable to start isolated preparation.');
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    const { row } = await send('auto-status', LINO_TEXT, { requestId });
    if (row.phase === 'completed') {
      const planId = await fixture.interruptBeforeComparison(requestId);
      return { requestId, planId };
    }
    await delay(25);
  }
  throw new Error('The fixture did not acknowledge its preparation.');
};

const fixture = await experienceAutoBrowserFixture();
try {
  const recovery = process.argv[3] === 'resume';
  const config = experienceAutoInspectionConfig({
    base: fixture.base,
    input: fixture.input,
    ...(recovery ? await interruptedPreparation(fixture) : {}),
  });
  await writeFile(
    process.argv[2],
    mcpInspectionCode(
      recovery ? inspectExperienceAutoResume : inspectExperienceAuto,
      config
    )
  );
  await waitForCvFixtureShutdown(fixture);
  console.log(
    JSON.stringify({ reads: fixture.reads(), resourcesClosed: true })
  );
} catch (error) {
  await fixture.close();
  throw error;
}
