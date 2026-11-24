import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { experienceFromHhExport } from '../../js/src/cv/experience-hh.js';
import { experienceAutoKey } from '../../js/src/cv/experience-auto-record.js';
import { experiencePlanKey } from '../../js/src/cv/experience-plan-record.js';
import { reviewChildId } from '../../js/src/cv/experience-review-record.js';
import { LINO_TEXT } from '../../js/src/transport/lino.js';
import { cvFixtureRequest } from './cv-fixture-server.mjs';
import { cvTechnologyFixture } from './cv-technology-fixture.mjs';
import { experienceDocumentFixture } from './experience-document-fixture.mjs';
import { resumeExportReceipt } from './resume-export-fixture.mjs';

export const saveFreshReviewExport = async (
  { store, artifactRoot },
  hash,
  cv
) => {
  const receipt = {
    ...resumeExportReceipt(hash),
    exportId: randomUUID(),
    title: cv.title,
    language: cv.language,
    capturedAt: new Date().toISOString(),
  };
  const bytes = Buffer.from(JSON.stringify(cv));
  const json = receipt.files.find(({ name }) => name === 'resume.json');
  json.size = bytes.length;
  json.sha256 = createHash('sha256').update(bytes).digest('hex');
  const directory = join(artifactRoot, receipt.exportId, hash);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'resume.json'), bytes, { mode: 0o600 });
  for (const id of [
    `jobs-resume-artifact:${receipt.exportId}:${hash}`,
    `jobs-resume-export:jobs:${hash}`,
  ]) {
    await store.put({ id, version: 1, ...receipt });
  }
  return receipt;
};

export const experienceReviewFixtureData = async (context) => {
  const { identity, cv } = context.sources.find(
    ({ cv }) => cv.language === 'en'
  );
  const hh = await experienceFromHhExport(context, identity);
  const source = experienceDocumentFixture('linkedin');
  source.jobs = hh.document.jobs;
  source.profile = { about: 'Reviewed biography from the LinkedIn source.' };
  const read = async ({ signal }, progress) => {
    signal.throwIfAborted();
    await progress('reading', { positions: source.jobs.length });
    return {
      document: source,
      files: [
        'linkedin-experience.txt',
        'linkedin-experience.json',
        'experience.lino',
        'experience.bin',
      ].map((name) => ({ name, size: 0, sha256: 'a'.repeat(64) })),
      discard: async () => {},
    };
  };
  const input = {
    url: source.source.url,
    language: source.source.language,
    to: 'hh',
    hash: identity.hash,
    asOf: '2026-11',
  };
  return { source, cv, input, read };
};

export const experienceReviewFixture = async () => {
  const context = await cvTechnologyFixture();
  try {
    return { ...context, ...(await experienceReviewFixtureData(context)) };
  } catch (error) {
    await context.close();
    throw error;
  }
};

export const interruptOwnedReviewAcquisition = async ({
  base,
  queue,
  store,
  seedReviewAcquisition,
}) => {
  const send = cvFixtureRequest(`${base}/api/cv/experience/`, ['auto-status']);
  const review = await seedReviewAcquisition();
  await store.put({ ...review, waitingLogin: true });
  const requestId = reviewChildId(review, 'auto');
  const started = await send('auto-start', LINO_TEXT, {
    ...queue.input,
    requestId,
  });
  if (!started.response.ok) {
    throw new Error('The fixture did not admit the review acquisition.');
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    const { row } = await send('auto-status', LINO_TEXT, { requestId });
    if (row.phase === 'completed') {
      const original = await store.get(experienceAutoKey(requestId));
      await store.put({
        ...original,
        phase: 'acquiring-linkedin',
        step: 'waiting-login',
        linkedin: null,
        plan: null,
      });
      await store.delete(experiencePlanKey(original.plan.requestId));
      return { review, original };
    }
    await delay(50);
  }
  throw new Error('The fixture did not acknowledge the review acquisition.');
};
