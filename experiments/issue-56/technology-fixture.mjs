import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { modelFingerprint } from '../../js/src/automation/answer-model-context.js';
import { sanitizedResumeCv } from '../../js/src/jobs/resume-cv.js';
import {
  resumeCvFixture,
  resumeExportReceipt,
} from './resume-export-fixture.mjs';
import { vacancySnapshotFixture } from './vacancy-fixture.mjs';

export const technologyVacancies = () => [
  {
    ...vacancySnapshotFixture(),
    description:
      'Employer introduction.\nRequirements:\nPostgres, PostgreSQL, React Native, PHP 8.\nPreferred:\nDocker, NPM.\nResponsibilities:\nKeep the original final paragraph.',
    skills: ['Postgres', 'Kubernets', 'Communication'],
  },
  {
    ...vacancySnapshotFixture(),
    url: 'https://hh.ru/vacancy/124',
    title: 'Platform engineer',
    description:
      'Требования:\nPostgres и SQL.\nБудет плюсом:\nPython.\nУсловия:\nРабота удалённо.',
    skills: ['Postgres', 'SQL'],
  },
];
export const technologyCv = () => {
  const cv = sanitizedResumeCv(resumeCvFixture()).cv;
  cv.about =
    'Built services with PostgreSQL and React. We go carefully through basic requirements.';
  cv.skills = ['JavaScript', 'SQL'];
  cv.jobs[0].description =
    'Owned PostgreSQL and npm tooling. Preserved biography and job narrative.';
  return cv;
};
export const technologyFixture = async ({
  cv = technologyCv(),
  receipt = resumeExportReceipt(),
} = {}) => {
  const artifactRoot = await mkdtemp(join(tmpdir(), 'hh-technology-'));
  const store = createMemoryStore();
  const bytes = Buffer.from(JSON.stringify(cv));
  receipt.files = receipt.files.map((file) =>
    file.name === 'resume.json'
      ? {
          ...file,
          size: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        }
      : file
  );
  const folder = join(artifactRoot, receipt.exportId, receipt.hash);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await writeFile(join(folder, 'resume.json'), bytes, { mode: 0o600 });
  const rows = [
    {
      id: `jobs-resume-artifact:${receipt.exportId}:${receipt.hash}`,
      version: 1,
      ...receipt,
    },
    { id: `jobs-resume-export:jobs:${receipt.hash}`, version: 1, ...receipt },
  ];
  for (const vacancy of technologyVacancies()) {
    rows.push({
      id: `assignment-vacancy:${await modelFingerprint(vacancy.url)}`,
      version: 1,
      ...vacancy,
    });
  }
  for (const row of rows) {
    await store.put(row);
  }
  return {
    store,
    artifactRoot,
    receipt,
    folder,
    cv,
    rows,
    input: {
      browserSlot: 'jobs',
      exportId: receipt.exportId,
      hash: receipt.hash,
    },
    close: () => rm(artifactRoot, { recursive: true, force: true }),
  };
};
