// Recognize only explicit work-start timing, not project duration or office consent.
// Finite gaps keep these checks bounded on the shared question/answer limits.
const WORK_START = [
  /\b(?:start|begin|join)\b[^?？.!\r\n]{0,70}\b(?:work|job|team|us|company|project)\b/iu,
  /(?:выйти|выход|приступ|присоедин|начать)[^?？.!\r\n]{0,70}(?:работ|мест|команд|проект|нам)/iu,
  /(?:काम|नौकरी)[^?।!\r\n]{0,50}(?:शुरू|आरंभ|जुड़)/u,
  /(?:开始工作|开始上班|入职|加入团队)/u,
];
const OPEN_TIMING = [
  /\b(?:when|how soon|how quickly|what date|how much time)\b/iu,
  /(?:когда|как скоро|как быстро|срок|сколько времени|какое время)/iu,
  /(?:कब|कितनी जल्दी|कितना समय)/u,
  /(?:什么时候|何时|多久|哪天|什么时间)/u,
];
const CLOSED_TIMING = [
  /\b(?:in|after|before|within|on|immediately|tomorrow|today)\b/iu,
  /(?:через|после|сразу|немедленно|завтра|сегодня)/iu,
  /(?:सप्ताह|दिन|महीने|तुरंत)/u,
  /(?:周|星期|天|个月|立即)/u,
];
const TIME_ANSWER = [
  /\p{N}/u,
  /\b(?:weeks?|months?|days?|years?|hours?|date|tomorrow|today|immediately|now|offer|ready|after|before|discuss|agree|as soon as|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu,
  /(?:недел|месяц|день|дня|дней|дат|завтра|сегодня|немедленно|сразу|офер|оффер|готов|после|через|обсуд|соглас|как только|понедельник|вторник|среду|четверг|пятниц|суббот|воскресен)/iu,
  /(?:सप्ताह|दिन|महीन|वर्ष|तारीख|तिथि|आज|कल|तुरंत|अभी|प्रस्ताव|ऑफर|तैयार|बाद|पहले|चर्चा|सहमत)/u,
  /(?:周|星期|个月|年|日期|明天|今天|立即|马上|录用|准备|之后|后|之前|讨论|商定|协商)/u,
];
const BOOLEAN = /^(?:yes|no|да|нет|हाँ|हां|नहीं|是|是的|不)[.!。！।\s]*$/iu;
const some = (patterns, text) => patterns.some((pattern) => pattern.test(text));

/** A timing reply needs a time/condition; an explicit closed question permits yes/no. */
export const fitsWorkStartTiming = (question, answer) => {
  if (!some(WORK_START, question)) {
    return true;
  }
  const open = some(OPEN_TIMING, question);
  if (!open && !some(CLOSED_TIMING, question)) {
    return true;
  }
  return (!open && BOOLEAN.test(answer.trim())) || some(TIME_ANSWER, answer);
};
