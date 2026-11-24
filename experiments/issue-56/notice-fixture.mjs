// Synthetic public-free fixtures, shared by the actual CLI/API/browser probes.
export const noticeText =
  'We have received your application and will review your experience.';
export const noticeReply = 'Thank you, I will wait.';
export const savedRussianNotice =
  'Рассмотрим ваше резюме. Если навыки и опыт подойдут для позиции, мы свяжемся с вами.';
export const russianThanks = 'Здравствуйте, благодарю, ожидаю.';
export const activeReview =
  'Кандидат, здравствуйте!\nБлагодарим Вас за честные ответы чат-боту. Мы рассмотрим Ваше резюме.\nАнна Примерова';
export const botBinarySummary =
  'Есть ли у Вас опыт работы с микросервисами?: ДА';
export const botHandover = 'Спасибо за ответы! Мы передали их работодателю.';
export const noticeRule = (extra = {}) => ({
  id: 'qa-rule:application-notice',
  kind: 'notice',
  question: noticeText,
  answers: [{ text: noticeReply, approved: true, count: 1 }],
  ...extra,
});
export const recognizedNoticeRule = (extra = {}) =>
  noticeRule({
    id: 'qa-rule:older-russian-notice',
    question: savedRussianNotice,
    answers: [{ text: russianThanks, approved: true }],
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
