import assert from 'node:assert/strict';
import { modelFingerprint } from '../../js/src/automation/answer-model-context.js';
import { vacancySnapshotFixture } from './vacancy-fixture.mjs';

/** Finite private-cache corpus, deliberately inserted oldest first. */
export const seedVacancyCorpus = async (store, count = 101) => {
  assert.ok(Number.isInteger(count) && count > 0 && count <= 160);
  const rows = [];
  for (let index = 0; index < count; index++) {
    const url = `https://hh.ru/vacancy/${9000 + index}`;
    const capturedAt = new Date(
      Date.UTC(2026, 10, 18) - index * 60000
    ).toISOString();
    const description = `Requirements:\nPython. Private corpus entry ${index}.`;
    rows.push({
      ...vacancySnapshotFixture(),
      id: `assignment-vacancy:${await modelFingerprint(url)}`,
      version: 1,
      url,
      title: `Engineer ${index}`,
      description,
      descriptionHtml: `<p>${description}</p>`,
      skills: ['Python'],
      capturedAt,
      firstSeenAt: capturedAt,
      lastSeenAt: capturedAt,
      status: index === count - 1 ? 'applied' : 'encountered',
      ...(index === count - 1 ? { appliedAt: capturedAt } : {}),
    });
  }
  await store.putMany([...rows].reverse());
  return rows;
};
