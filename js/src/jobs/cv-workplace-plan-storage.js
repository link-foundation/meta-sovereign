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
  const key = fingerprint ? cvWorkplacePlanKey(fingerprint) : null;
  const privateRow =
    input.fingerprint && key ? await store.get(`secret:${key}`) : null;
  const row = privateRow ?? (key ? await store.get(key) : null);
  if (
    row &&
    (row.version !== 1 ||
      row.id !== (privateRow ? `secret:${key}` : key) ||
      Boolean(row.plan?.experience) !== Boolean(privateRow))
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
    id: `${plan.experience ? 'secret:' : ''}${cvWorkplacePlanKey(plan.fingerprint)}`,
    version: 1,
    plan,
  });
  if (!plan.experience) {
    await saveTechnologyRecord(store, {
      id: `jobs-cv-workplace-latest:${plan.browserSlot}`,
      fingerprint: plan.fingerprint,
    });
  }
  return { plan };
};
