import { HH_RESUMES_URL } from '../../js/src/jobs/resume-list.js';

export const resumeListFixture = (browserSlot = 'jobs') => ({
  url: HH_RESUMES_URL,
  browserSlot,
  challenge: false,
  observed: true,
  capturedAt: '2026-11-12T04:00:00.000Z',
  entries: [
    {
      hash: 'english',
      title: 'Senior Software Engineer',
      updatedAt: Date.UTC(2026, 10, 11),
      latest: true,
      updatedText: '',
    },
    {
      hash: 'russian-old',
      title: 'Разработчик',
      updatedAt: Date.UTC(2026, 10, 8),
      latest: false,
      updatedText: '',
    },
    {
      hash: 'russian-new',
      title: 'Ведущий разработчик',
      updatedAt: Date.UTC(2026, 10, 10),
      latest: false,
      updatedText: '',
    },
  ],
});

export const resumeListHtml = (mode = 'ready') => {
  const fixture = resumeListFixture();
  const state = {
    // This intentionally private data must never be returned or cached.
    account: { email: 'private@example.test', phone: '+10000000000' },
    latestResumeHash: 'english',
    applicantResumes: fixture.entries.map((row) => ({
      title: [{ string: row.title }],
      _attributes: { hash: row.hash, updated: row.updatedAt },
    })),
  };
  const cards = fixture.entries
    .map(
      (row) =>
        `<article data-qa="resume"><a data-qa="resume-card-link-${row.hash}" href="https://hh.ru/resume/${row.hash}?from=resume_list">${row.title}</a><p>Обновлено ${new Date(row.updatedAt).getUTCDate()} ноября 2026 в 10:00</p><button>Raise in search</button></article>`
    )
    .join('');
  if (mode === 'incomplete') {
    return '<h1>Loading resumes</h1>';
  }
  if (mode === 'cards-only') {
    return `<h1>My resumes</h1>${cards}`;
  }
  if (mode === 'empty') {
    state.applicantResumes = [];
  }
  if (mode === 'conflict') {
    state.applicantResumes[0]._attributes.hash = 'conflicting-account';
  }
  return `<h1>My resumes</h1>${mode === 'challenge' ? '<input name="captcha">' : ''}${['state-only', 'empty'].includes(mode) ? '' : cards}
    <template class="ResumeProfileFront-InitialState">${JSON.stringify(state).replaceAll('"', '&quot;')}</template>
    <article data-qa="resume" hidden><a data-qa="resume-card-link-hidden" href="https://evil.test/resume/hidden">Hidden</a></article>`;
};
