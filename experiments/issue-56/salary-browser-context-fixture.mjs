import {
  salaryAnchor,
  salaryNumberQuestion,
} from './salary-clarification-fixture.mjs';

export const salaryBrowserContext = () => {
  const question = { id: '103', body: salaryNumberQuestion, outgoing: false };
  return {
    question,
    strictOptions: false,
    answerOptions: [],
    hasDraft: false,
    messages: [
      {
        id: '101',
        body: salaryAnchor,
        outgoing: false,
        timestamp: '2026-11-17T09:58:00Z',
      },
      {
        id: '102',
        body: 'Thanks, noted.',
        outgoing: true,
        delivery: 'delivered',
        timestamp: '2026-11-17T09:59:00Z',
      },
      { ...question, timestamp: '2026-11-17T10:00:00Z' },
    ],
  };
};
