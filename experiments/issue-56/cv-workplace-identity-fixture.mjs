import { cvSaveAttempt } from '../../js/src/jobs/cv-watch-verification.js';

export const cvWorkplaceIdentityFixture = () => {
  const raw = {
    kind: 'workplace',
    url: 'https://hh.ru/profile/edit/experience/123',
    recordId: '123',
    company: 'Employer',
    position: 'Engineer',
    description: 'Final work',
    start: 'January 2020',
    end: 'May 2024',
    current: false,
    metadataEditable: true,
    area: 'London',
    website: 'https://example.org/',
    industryText: 'Software, finance',
    resumes: [
      { hash: 'english', checked: true },
      { hash: 'russian', checked: false },
    ],
  };
  const attempt = cvSaveAttempt(raw);
  const job = {
    company: raw.company,
    position: raw.position,
    description: raw.description,
    start: attempt.start,
    end: attempt.end,
    current: false,
    area: raw.area,
    website: 'example.org',
    industries: [{ id: '1.2', name: 'Software, finance', parent: 'Services' }],
  };
  const exports = [
    { hash: 'english', cv: { jobs: [job] }, industryEntries: job.industries },
    {
      hash: 'russian',
      cv: { jobs: [{ ...job, company: 'Another employer' }] },
    },
  ];
  return { raw, attempt, job, exports };
};
