import { browserName } from '../browser/policy.js';
import {
  confirmedCvWorkplacePlan,
  cvWorkplaceFail,
} from './cv-workplace-plan.js';
import { saveTechnologyRecord } from './technology-storage.js';

export const cvWorkplacePlanKey = (fingerprint) => {
  if (typeof fingerprint !== 'string' || !/^[a-f\d]{64}$/u.test(fingerprint)) {
    cvWorkplaceFail('options');
  }
  return `jobs-cv-workplace-plan:${fingerprint}`;
};
export const storedCvWorkplacePlan = async (store, input) => {
  const browserSlot = browserName(input.browserSlot ?? 'jobs');
  const fingerprint =
    input.fingerprint ??
    (await store.get(`jobs-cv-workplace-latest:${browserSlot}`))?.fingerprint;
  const row = fingerprint
    ? await store.get(cvWorkplacePlanKey(fingerprint))
    : null;
  if (
    row &&
    (row.version !== 1 || row.id !== cvWorkplacePlanKey(fingerprint))
  ) {
    cvWorkplaceFail();
  }
  return confirmedCvWorkplacePlan(
    { plan: row?.plan ?? null },
    { ...input, browserSlot }
  );
};
export const saveCvWorkplacePlan = async (store, plan) => {
  await confirmedCvWorkplacePlan({ plan });
  await saveTechnologyRecord(store, {
    id: cvWorkplacePlanKey(plan.fingerprint),
    version: 1,
    plan,
  });
  await saveTechnologyRecord(store, {
    id: `jobs-cv-workplace-latest:${plan.browserSlot}`,
    fingerprint: plan.fingerprint,
  });
  return { plan };
};
