import { importInto } from '../../js/src/sources/index.js';
import { withMessageVersions } from '../../js/src/storage/message-versions.js';

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

export const seedHhAnswerRevisions = async (store) => {
  const versioned = withMessageVersions(store);
  await importInto(versioned, 'hh', hhHistoryFixture());
  const edited = hhHistoryFixture('Thailand.');
  edited.negotiations[0].messages.items[1].edited_at = '2026-11-09T11:00:00Z';
  await importInto(versioned, 'hh', edited);
  const incomplete = {
    id: 'msg:hh:revision-coverage',
    source: 'hh',
    chat: 'history-56-partial',
    timestamp: '2026-11-09T10:00:01Z',
    sender: 'employer',
  };
  await versioned.putMany([
    { ...incomplete, body: 'When are you available?' },
    {
      ...incomplete,
      id: 'msg:hh:revision-coverage-answer',
      timestamp: '2026-11-09T10:00:02Z',
      sender: 'applicant',
      outgoing: true,
      edited: '2026-11-09T11:00:00Z',
      body: 'Monday morning.',
    },
  ]);
};
