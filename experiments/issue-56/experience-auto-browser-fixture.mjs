import { experienceAutoFixture } from './experience-auto-fixture.mjs';
import { startCvFixtureServer } from './cv-fixture-server.mjs';
import { experienceAutoKey } from '../../js/src/cv/experience-auto-record.js';
import { experiencePlanKey } from '../../js/src/cv/experience-plan-record.js';

export const experienceAutoBrowserFixture = async () => {
  const fixture = await experienceAutoFixture();
  try {
    const server = await startCvFixtureServer({
      store: fixture.store,
      vacancies: fixture.vacancies,
      cv: fixture.cv,
      localUi: true,
    });
    return {
      base: `http://127.0.0.1:${server.port}`,
      input: fixture.input,
      reads: () => fixture.calls.length,
      async interruptBeforeComparison(requestId) {
        const id = experienceAutoKey(requestId);
        const completed = await fixture.store.get(id);
        if (completed?.phase !== 'completed') {
          throw new Error('The fixture needs an acknowledged preparation.');
        }
        await fixture.store.put({
          ...completed,
          phase: 'acquiring-linkedin',
          step: 'waiting-login',
          linkedin: null,
          plan: null,
        });
        await fixture.store.delete(experiencePlanKey(completed.plan.requestId));
        return completed.plan.requestId;
      },
      close: async () => {
        await server.close();
        await fixture.close();
      },
    };
  } catch (error) {
    await fixture.close();
    throw error;
  }
};
