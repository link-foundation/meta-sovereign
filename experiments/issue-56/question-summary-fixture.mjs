export const summary = `В разговоре с кандидатом я узнал:
- Есть ли у вас опыт использования Rust? Ответ:
- Нет.
- Расскажите о вашем опыте с поиском Ответ:
- Разрабатывал поиск по техническим документам.

Вопросы к работодателю, на которые помощник не смог ответить:
Вопросов не было`;

export const summaryMessage = (source = 'hh') => ({
  id: `msg:${source}:handover:1`,
  source,
  chat: 'handover',
  sender: 'recruiter-bot',
  body: summary,
  timestamp: '2026-11-09T11:00:00Z',
});
