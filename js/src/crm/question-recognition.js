// Shared bounded recognition for conversation turns and answer automation.
// Recognition proposes a question; saved rules and approval authorize reuse.
export const MAX_QUESTION_LENGTH = 6000;
const W = '[\\p{L}\\p{M}\\p{N}_]';
const start = (source) => new RegExp(`^(?:${source})(?!${W})`, 'iu');
const QUESTION_START = start(
  'как|что|чем|где|куда|откуда|когда|почему|зачем|кто|кем|какой|какая|какое|какие|сколько|можно|нельзя ли|не подскажете|подскажи|подскажите|есть ли|был ли|была ли|были ли|how|what|where|when|why|who|which|do you|did you|are you|can you|could you|would you|is there|have you'
);
const REQUEST = start(
  'please\\s+(?:tell|share|describe|provide|send)|tell\\s+(?:me|us)|describe\\s+your|share\\s+your|расскажите|расскажи|укажите|укажи|напишите|напиши|пришлите|пришли|уточните|уточни|сообщите|сообщи|опишите|опиши|поделитесь|поделись|приведи(?:те)?\\s+пример'
);
const HINDI_WORD =
  'क्या|कहाँ|कहां|कब|क्यों|कैसे|कौन|किस(?:का|की|के|े)?|कितन(?:ा|ी|े)';
const HINDI_START = start(HINDI_WORD);
const HINDI_SUBJECT = new RegExp(
  `^(?:आप|तुम|आपका|आपकी|आपके|तुम्हारा|तुम्हारी|तुम्हारे)(?!${W})[^।.!?\\r\\n]{0,100}?(?<!${W})(?:${HINDI_WORD})(?!${W})`,
  'u'
);
const HINDI_REQUEST = new RegExp(
  `^(?:कृपया(?!${W})[^।.!?\\r\\n]{0,160}?(?<!${W}))?(?:बताइए|बताएं|बतायें|बताओ|साझा करें|भेजें|प्रदान करें|उल्लेख करें|लिखें)(?!${W})`,
  'u'
);
// Han text has no required spaces: ASCII word boundaries would miss it.
const CHINESE_REQUEST =
  /^(?:请问|请(?:[你您]\s*)?(?:介绍|说明|提供|告诉|描述|分享|填写|发送|补充|确认))/u;
const CHINESE_START =
  /^(?:为什么|为何|哪里|哪儿|何时|怎么|如何|谁|哪(?:个|些|种))/u;
const CHINESE_SUBJECT =
  /^(?:你|您|贵方|贵司|贵公司)[^。！？.!?\r\n]{0,100}(?:什么|哪里|哪儿|何时|多少|几|怎么|如何|是否|能否|吗)/u;
const ACKNOWLEDGMENT =
  /^(?:ок(?:ей)?|okay|ok|хорошо|понял(?:а)?|thanks|thank you|спасибо|धन्यवाद|谢谢|好的)[,，!！.。:：]\s*/iu;
const CONNECTOR = /^(?:(?:а|and|और)\s+|那么[，,\s]*)/iu;

const questionFragment = (fragment) => {
  let text = fragment.trim();
  for (let count = 0; count < 3; count++) {
    text = text.replace(ACKNOWLEDGMENT, '');
  }
  text = text.replace(CONNECTOR, '');
  if (
    REQUEST.test(text) ||
    HINDI_REQUEST.test(text) ||
    CHINESE_REQUEST.test(text)
  ) {
    return true;
  }
  if (text.length > 120) {
    return false;
  }
  return (
    (!/[.!]$/u.test(text) && QUESTION_START.test(text)) ||
    HINDI_START.test(text) ||
    HINDI_SUBJECT.test(text) ||
    CHINESE_START.test(text) ||
    CHINESE_SUBJECT.test(text)
  );
};

/** Explicit marks, short interrogatives, or factual requests in EN/RU/HI/ZH. */
export const isQuestion = (text) => {
  const value = String(text ?? '').trim();
  if (!value || value.length > MAX_QUESTION_LENGTH) {
    return false;
  }
  if (/[?？]/u.test(value)) {
    return true;
  }
  // Keep sentence-ending punctuation for the historical EN/RU guard:
  // "Как дела" asks, while "Что ж, ладно." does not.
  return value.split(/(?<=[.!。！？।])\s*|\n+/u).some(questionFragment);
};
