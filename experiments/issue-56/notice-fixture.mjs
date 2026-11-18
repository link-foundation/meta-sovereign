// Synthetic public-free fixtures, shared by the actual CLI/API/browser probes.
export const noticeText =
  'We have received your application and will review your experience.';
export const noticeReply = 'Thank you, I will wait.';
export const noticeRule = (extra = {}) => ({
  id: 'qa-rule:application-notice',
  kind: 'notice',
  question: noticeText,
  answers: [{ text: noticeReply, approved: true, count: 1 }],
  ...extra,
});
export const noticeMessage = (source = 'hh') => ({
  id: `msg:${source}:notice:1`,
  source,
  chat: 'notice',
  sender: 'them',
  body: noticeText,
  timestamp: '2026-11-11T12:00:00.000Z',
});
