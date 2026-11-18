/** Synthetic, bounded snapshots; no account or provider traffic. */
export const experienceEntries = () => [
  {
    platform: 'hh',
    cv: {
      experience: [
        {
          company: 'ООО «Эвирма»',
          title: 'Разработчик',
          start: '2020-01',
          end: '2023-06',
          location: 'Москва',
          description: 'Разработка API',
          skills: ['SQL', 'Go'],
          website: 'https://example.test',
          areaId: '1',
          industries: [{ id: '7', name: 'Информационные технологии' }],
          native: { recordId: 'hh-job-1', ownerOnly: true },
        },
        {
          company: 'Only HH',
          title: 'Engineer',
          start: '2017-01',
          end: '2018-12',
        },
        {
          company: 'Concurrent',
          title: 'Engineer',
          start: '2010-01',
          end: '2013-06',
        },
        {
          company: 'Concurrent',
          title: 'Lead',
          start: '2012-01',
          end: '2015-06',
        },
        { company: 'Missing dates', title: 'Engineer' },
      ],
    },
  },
  {
    platform: 'linkedin',
    cv: {
      experience: [
        {
          company: 'Evirma LLC',
          title: 'Software engineer',
          start: '2020-02',
          end: '2023-05',
          location: 'Moscow',
          description: 'API development',
          skills: ['go', 'sql'],
          website: 'https://example.test',
          areaId: '1',
          industries: [{ id: '7', name: 'Information technology' }],
          native: {
            recordId: 'linkedin-job-1',
            media: [{ url: 'https://example.test' }],
          },
        },
        {
          company: 'Only LinkedIn',
          title: 'Engineer',
          start: '2016-01',
          end: '2016-12',
        },
        {
          company: 'Concurrent',
          title: 'Engineer',
          start: '2011-01',
          end: '2014-06',
        },
        {
          company: 'Missing dates',
          title: 'Engineer',
          start: '2000-01',
          end: '2001-01',
        },
      ],
    },
  },
];
