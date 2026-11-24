import { NO_NOTICE_REPLY } from '../../js/src/automation/question-notices.js';

export const summary = `В разговоре с кандидатом я узнал:
- Есть ли у вас опыт использования Rust? Ответ:
- Нет.
- Расскажите о вашем опыте с поиском Ответ:
- Разрабатывал поиск по техническим документам.

Вопросы к работодателю, на которые помощник не смог ответить:
Вопросов не было`;

export const summaryFollowup = 'We have recorded the details. Thank you.';
export const noReplyFollowupRule = (approved = true) => ({
  id: 'recorded-details',
  kind: 'notice',
  question: summaryFollowup,
  answers: [{ text: NO_NOTICE_REPLY, approved }],
});
export const unreadSummaryHistory = {
  8: {
    6: {
      body: summary.replaceAll('\n', '<br>'),
      timestamp: '2026-11-09T11:00:00Z',
    },
  },
};
export const unreadSummaryAndNoticeHistory = {
  8: {
    5: unreadSummaryHistory[8][6],
    6: { body: summaryFollowup, timestamp: '2026-11-09T11:01:00Z' },
  },
};

export const summaryMessage = (source = 'hh') => ({
  id: `msg:${source}:handover:1`,
  source,
  chat: 'handover',
  sender: 'recruiter-bot',
  body: summary,
  timestamp: '2026-11-09T11:00:00Z',
});
