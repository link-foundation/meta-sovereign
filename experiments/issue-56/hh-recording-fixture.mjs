// Synthetic wording in the exact shape written by the pinned HH recorder.
export const hhRecordingChat = '86100';
export const hhRecordingAnswer = `msg:hh:web:${hhRecordingChat}:86202`;
export const hhRecordingFixture = () => ({
  [hhRecordingChat]: {
    vacancy: 'Archive Engineer',
    company: 'Private test company',
    historyComplete: false,
    at: '2026-11-21T11:00:00.000Z',
    messages: [
      {
        id: '86201',
        mine: false,
        title: 'Employer',
        heading: '',
        text: 'Which language do you use?',
      },
      {
        id: '86202',
        mine: true,
        title: '',
        heading: '',
        text: 'Python and JavaScript',
        previousTexts: [
          'Python',
          'Python 3',
          'Python',
          'Python and JavaScript',
        ],
      },
    ],
    answerCounts: [
      { question: 'Private summary', answer: 'Ignore this', count: 999 },
    ],
  },
});
