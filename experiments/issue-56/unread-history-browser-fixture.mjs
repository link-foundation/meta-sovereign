const timestamp = (minute) => `2026-11-09T11:0${minute}:00Z`;

export const historyAnswer =
  'I build document search around a local full-text index.';
export const historyNotice = 'Thanks for letting me know.';

export const unreadHistoryMessages = {
  8: {
    2: { body: 'How do you build a document search?', timestamp: timestamp(2) },
    3: { body: historyAnswer, timestamp: timestamp(3), delivery: 'delivered' },
    4: {
      body: 'We will review your application this week.',
      timestamp: timestamp(4),
    },
    5: { body: historyNotice, timestamp: timestamp(5), delivery: 'read' },
    6: { body: 'Can you start on Thursday?', timestamp: timestamp(6) },
    7: {
      body: 'Would Friday work?',
      timestamp: timestamp(7),
      delivery: 'sent',
    },
  },
};
