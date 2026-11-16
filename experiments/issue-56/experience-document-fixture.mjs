export const experienceDocumentFixture = (platform = 'hh') => ({
  kind: 'cv-experience',
  version: 1,
  platform,
  source: {
    id: platform === 'hh' ? 'a'.repeat(40) : 'example-person',
    language: 'en',
    capturedAt: '2026-11-16T08:00:00.000Z',
    url:
      platform === 'hh'
        ? `https://hh.ru/resume/${'a'.repeat(40)}`
        : 'https://www.linkedin.com/in/example-person/details/experience/',
  },
  profile: {
    name: 'Example Person',
    about: 'Original About.',
    skills: ['Profile-only skill'],
  },
  jobs: [
    {
      company: 'Evirma LLC',
      title: 'Team Lead',
      location: 'London',
      start: '2024-01',
      end: null,
      current: true,
      description: 'Original narrative.\nTools: CI/CD, C/C++, .NET',
      skills: ['CI/CD', 'C/C++', '.NET'],
      native: {
        recordId: 'job-native-1',
        areaId: '1',
        website: 'https://example.test/archived/path/',
        industries: [{ id: '7.540', name: 'Software Development' }],
        media: [{ url: 'https://example.test/a?b=c', title: 'Original media' }],
        unknownFuture: { retained: true },
      },
    },
  ],
});
