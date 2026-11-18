import { applicationResumeFixture } from './application-resume-fixture.mjs';
import { configureApplicationFullForm } from './application-fullform-fixture.mjs';
import { applicationInput } from './application-fixture.mjs';
import { technologyFixture, technologyCv } from './technology-fixture.mjs';
import { resumeListFixture } from './resume-list-fixture.mjs';
import { resumeExportReceipt } from './resume-export-fixture.mjs';
import { cp } from 'node:fs/promises';
import { applicationResumeOptions } from './application-resume-options-fixture.mjs';

export const standardLetters = {
  en: 'Reviewed English standard letter.',
  ru: 'Проверенное стандартное письмо.',
};

/** Two real checked export artifacts; the misleading Latin title is still Russian. */
export const applicationLanguageEvidence = async (evidence) => {
  const list = resumeListFixture();
  const entry = list.entries.find((row) => row.hash === 'russian-old');
  entry.title = applicationResumeOptions()[0].title;
  await evidence.store.put({ id: 'jobs-resumes:jobs', version: 1, ...list });
  const english = await technologyFixture({
    cv: {
      ...technologyCv(),
      language: 'en',
      title: entry.title,
      hash: entry.hash,
    },
    receipt: {
      ...resumeExportReceipt(),
      language: 'en',
      title: entry.title,
      hash: entry.hash,
      updatedAt: entry.updatedAt,
    },
  });
  try {
    await cp(english.artifactRoot, evidence.artifactRoot, { recursive: true });
    for (const row of english.rows.filter((row) =>
      row.id.startsWith('jobs-resume-')
    )) {
      await evidence.store.put(row);
    }
  } finally {
    await english.store.close?.();
    await english.close();
  }
};
export const applicationLanguageFixture = async (
  t,
  { input = {}, vacancy, open = true } = {}
) => {
  const fixture = await applicationResumeFixture(t, { enter: false, vacancy });
  await applicationLanguageEvidence(fixture);
  await configureApplicationFullForm(fixture);
  t?.after(() => fixture.service.stop());
  fixture.state.fields[1].label = 'Расскажите о вашем последнем опыте работы';
  fixture.input = {
    ...applicationInput,
    autoSelectResumeLanguage: true,
    standardLetters,
    ...input,
  };
  if (open) {
    fixture.opened = await fixture.service['application-open'](fixture.input);
  }
  return fixture;
};
