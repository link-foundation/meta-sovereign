// Documented HH negotiation/message shapes, with invented people and text.
export const hhHistoryFixture = (answer = 'Vietnam.') => ({
  negotiations: [
    {
      id: 'history-56',
      vacancy: { id: 'vacancy-56' },
      messages: {
        items: [
          {
            id: '56001',
            author: { participant_type: 'employer' },
            state: { id: 'text' },
            created_at: '2026-11-09T10:00:01Z',
            text: 'Where do you live?',
          },
          {
            id: '56002',
            author: { participant_type: 'applicant' },
            state: { id: 'text' },
            created_at: '2026-11-09T10:00:02Z',
            text: answer,
          },
          {
            id: '56003',
            author: { participant_type: 'employer' },
            state: { id: 'text' },
            created_at: '2026-11-09T10:00:03Z',
            text: 'What is your experience?',
          },
          {
            id: '56004',
            author: { participant_type: 'applicant' },
            state: { id: 'response' },
            created_at: '2026-11-09T10:00:04Z',
            text: 'Please consider my application.',
          },
        ],
      },
    },
  ],
});
