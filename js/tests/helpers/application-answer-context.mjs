import { applicationFixture } from '../../../experiments/issue-56/application-fixture.mjs';
import {
  applicationAnswerQuestionnaire,
  seedApplicationAnswerContext,
} from '../../../experiments/issue-56/application-answer-context-fixture.mjs';
import { planFormAnswers } from '../../src/forms/answer-plan.js';
import { formModelInspection } from './forms-plan-inspection.mjs';
import { vacancySnapshotFixture } from '../../../experiments/issue-56/vacancy-fixture.mjs';

/** Exercise actual service admission and shared planning with no browser process. */
export const applicationAnswerContextFixture = async (t) => {
  const inspection = () => ({
    ...formModelInspection(globalThis.structuredClone(fixture.state.fields)),
    navigation: { nextPage: false, limited: false },
  });
  const fixture = applicationFixture({
    vacancy: () => ({ ...vacancySnapshotFixture(), salary: 'от 600000 ₽' }),
    application: {
      filling: {
        clear: async (record) => {
          record.reviewPlan = null;
        },
        inspect: async () => inspection(),
        plan: async (record, options, check) => {
          check();
          const current = inspection();
          const report = await planFormAnswers(fixture.store, {
            ...options,
            inspection: current,
          });
          record.reviewPlan = { inspection: current };
          return { ...report, reviewPlan: { id: 'context-plan' } };
        },
      },
    },
  });
  t.after(() => fixture.close());
  fixture.state.fields[1].label = applicationAnswerQuestionnaire;
  fixture.state.fields[1].tag = 'textarea';
  const profile = await seedApplicationAnswerContext(fixture.store);
  return { ...fixture, profile };
};
