import { resumeIndustriesFixture } from './resume-export-fixture.mjs';
import { cvPrepareFixture } from './cv-prepare-fixture.mjs';

/** Tiny localized public dictionary stand-ins, kept separate from owner data. */
export const cvWorkplaceDictionaryRows = () =>
  ['ru', 'en'].flatMap((language) => [
    {
      id: `jobs-areas:${language}`,
      version: 1,
      fetchedAt: Date.now(),
      tree: [
        { id: '1', name: 'Remote', areas: [] },
        { id: '2', name: language === 'ru' ? 'Москва' : 'Moscow', areas: [] },
      ],
    },
    {
      id: `jobs-industries:${language}`,
      version: 1,
      fetchedAt: Date.now(),
      tree: resumeIndustriesFixture(language).map((group) => ({
        ...group,
        industries: [
          ...group.industries,
          {
            id: '7.541',
            name: language === 'ru' ? 'Автоматизация' : 'Automation',
          },
        ],
      })),
    },
  ]);
export const cvWorkplaceFieldsPatch = {
  company: 'Revised Labs',
  position: 'Senior Engineer',
  description: 'Build useful systems.\nKeep this reviewed narrative.',
  website: '',
  start: '2019-03',
  end: '2024-08',
  current: false,
  areaId: '2',
  industryIds: ['7.541'],
};
export const cvWorkplaceFieldsFixture = async () => {
  const f = await cvPrepareFixture();
  const dictionaries = cvWorkplaceDictionaryRows();
  for (const row of dictionaries) {
    await f.store.put(row);
  }
  const { identity } = f.sources.find((row) => row.identity.language === 'en');
  return {
    ...f,
    rows: [...f.rows, ...dictionaries],
    proposal: {
      browserSlot: 'jobs',
      exportId: identity.exportId,
      hash: identity.hash,
      jobIndex: 0,
      recordId: '123',
      fields: cvWorkplaceFieldsPatch,
    },
  };
};
