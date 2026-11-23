import { createHash } from 'node:crypto';
import { RESUME_NATIVE_FORMATS } from '../../js/src/jobs/resume-export-options.js';
import { RESUME_DERIVED_FORMATS } from '../../js/src/jobs/resume-export-result.js';

export const exportId = '12345678-1234-4321-8123-123456789012';
export const resumeIndustriesFixture = (language) => [
  {
    id: '7',
    name: language === 'ru' ? 'Технологии' : 'Technology',
    industries: [
      {
        id: '7.540',
        name: language === 'ru' ? 'Программное обеспечение' : 'Software',
      },
    ],
  },
];
export const resumeCvFixture = (language = 'en') => ({
  language,
  name: 'Alex Example',
  title: language === 'ru' ? 'Разработчик' : 'Software Engineer',
  skills: ['JavaScript', 'SQL'],
  about:
    'Build reliable applications.\nContact alex@example.test\nTelegram: @private\nSalary: 100000 USD\nDate of birth: 1990-01-01',
  email: 'private@example.test',
  phone: '+12025550123',
  salary: '100000 USD',
  jobs: [
    {
      company: 'Example Labs',
      position: 'Engineer',
      start: '2020-05',
      end: null,
      current: true,
      period:
        language === 'ru' ? 'Май 2020 — настоящее время' : 'May 2020 — present',
      area: 'Remote',
      website:
        'https://web.archive.org/web/20200101000000/https://example.test/',
      industries: [
        {
          id: '7.540',
          name: language === 'ru' ? 'Программное обеспечение' : 'Software',
          parent: language === 'ru' ? 'Технологии' : 'Technology',
        },
      ],
      description:
        'Built services.\nPhone +1 (202) 555-0123\nKept them reliable.',
    },
  ],
});
const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
export const resumeExportHtml = (language = 'en', jobs) => {
  const cv = resumeCvFixture(language);
  const paragraphs = (text) => escapeHtml(text).replaceAll('\n', '<br>');
  const workplace = (job) =>
    `<div class="resume-experience"><p class="bloko-form-hint">${escapeHtml(job.period)}</p>
      <h3 class="resume-experience__company">${escapeHtml(job.company)}</h3><p class="info">${escapeHtml(job.area)}, ${escapeHtml(job.website)}</p>
      ${job.industries.map((industry) => `<p>${escapeHtml(industry.parent)}</p><ul><li>${escapeHtml(industry.name)}</li></ul>`).join('')}
      <h4 class="resume-experience__position">${escapeHtml(job.position)}</h4><p>${paragraphs(job.description)}</p></div>`;
  return `<!doctype html><html><body>
    <h1 class="resume__title">${cv.name}</h1><h2 class="resume__position">${cv.title}</h2>
    <p>${language === 'ru' ? 'Резюме обновлено' : 'Resume updated'} 12 November 2026</p>
    <p>private@example.test · +12025550123 · Date of birth: 1990-01-01 · Salary: 100000 USD</p>
    <div class="resume-skils"><p class="bloko-form-hint">${language === 'ru' ? 'Навыки' : 'Skills'}</p>
      <div class="resume-skils__item"><span>JavaScript;</span><span>SQL;</span></div></div>
    <div class="resume-skils"><p class="bloko-form-hint">${language === 'ru' ? 'Обо мне' : 'About me'}</p>${paragraphs(cv.about)}</div>
    ${(jobs ?? cv.jobs).map(workplace).join('')}
    <script>globalThis.nativeExportScriptExecuted=true;</script></body></html>`;
};
export const nativeResumeBytes = (format, language = 'en') =>
  Buffer.from(
    format === 'html'
      ? resumeExportHtml(language)
      : format === 'pdf'
        ? '%PDF-1.4\nSynthetic bounded export fixture\n%%EOF\n'
        : '{\\rtf1 Synthetic bounded export fixture}'
  );
export const resumeExportFixtureContent = (name) => {
  const native = Object.values(RESUME_NATIVE_FORMATS).some(
    (spec) => spec.name === name
  );
  return native
    ? nativeResumeBytes(name === 'resume.html' ? 'html' : name.split('.')[1])
    : Buffer.from('Fixture derived content\n');
};
export const resumeExportReceipt = (hash = 'english') => ({
  exportId,
  hash,
  browserSlot: 'jobs',
  title: 'Software Engineer',
  language: 'en',
  languageEvidence: 'native-export',
  capturedAt: '2026-11-12T06:00:00.000Z',
  updatedAt: Date.UTC(2026, 10, 11),
  sanitization: {
    removedLines: 5,
    kinds: ['birth-date', 'email', 'messenger', 'phone', 'salary'],
  },
  files: [
    ...Object.values(RESUME_NATIVE_FORMATS),
    ...Object.values(RESUME_DERIVED_FORMATS),
  ].map((spec) => {
    const native = Object.values(RESUME_NATIVE_FORMATS).includes(spec);
    const content = resumeExportFixtureContent(spec.name);
    return {
      ...spec,
      native,
      size: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  }),
});
