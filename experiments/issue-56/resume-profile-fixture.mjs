// Synthetic owner contacts only; no personal résumé or authenticated export.
export const resumeCv = {
  id: 'cv:resume-import',
  platform: 'hh',
  url: 'https://hh.ru/resume/synthetic-owner',
  capturedAt: '2026-11-10T23:00:00Z',
  cv: {
    basics: { name: 'Alex Example', birthDate: '1990-03-02' },
    links: [
      { label: 'GitHub', url: 'https://github.com/synthetic-owner' },
      {
        label: 'GitHub organisation',
        url: 'https://github.com/synthetic-team',
      },
      { label: 'Portfolio', url: 'https://portfolio.example.test/alex' },
    ],
  },
};

export const resumeMarkdown = `# Example Alex

**First name:** Alex
**Last name:** Example
Мужчина, 36 лет, родился 2 марта 1990
Проживает: Hanoi
+1 (555) 555-0123
[owner@example.test](mailto:owner@example.test)
Telegram: [@synthetic_owner](https://t.me/synthetic_owner)
GitHub: [Personal](https://github.com/synthetic-owner), [Team](https://github.com/synthetic-team)
Резюме: [HH](https://hh.ru/resume/synthetic-owner)

## Опыт работы

Employer contact: company@example.test
[Employer](https://github.com/employer-example)
`;

export const githubLinks =
  'https://github.com/synthetic-owner\nhttps://github.com/synthetic-team';
