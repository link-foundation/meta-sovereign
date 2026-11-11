// Conservative turn cleanup. Transcripts, choice keys and stored approvals
// remain untouched; only recognized conversational padding is removable.
import {
  isQuestion,
  MAX_QUESTION_LENGTH,
} from '../crm/question-recognition.js';

export const debugQuestionTurn = (event, identifiers) => {
  if (globalThis.process?.env?.META_SOVEREIGN_QUESTION_DEBUG === '1') {
    console.error('[question-turns]', event, identifiers);
  }
};

const words = (text) =>
  String(text)
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
const ACK_WORDS = new Set(
  'ок окей хорошо понял поняла спасибо благодарю принято отлично ясно за ваш ваши ответ ответы отклик подробности информацию учту опыт hello hi thanks thank you for the your answer answers details information understood noted okay ok got it नमस्ते धन्यवाद 谢谢 好的'.split(
    ' '
  )
);
const ackOnly = (text) => {
  const tokens = words(text);
  return tokens.length > 0 && tokens.every((word) => ACK_WORDS.has(word));
};
const ACK_PREFIX = /^([^?？.!。！।\r\n]{1,180}[,.!。！।，])\s*/u;
const CONNECTOR = /^(?:(?:а|теперь|and|और)\s+|那么[，,\s]*)/iu;
const POLITE =
  /^(?:(?:расскажите|скажите|подскажите|уточните)\s*,?\s*(?:пожалуйста\s*,?\s*)?|please\s+(?:tell|share with)\s+(?:me|us)\s+)(?=(?:был[аи]? ли|есть ли|в каких|как|где|когда|почему|что|чем|сколько|how|where|when|why|what|which)\s)/iu;

/** Strip known padding only if the remainder still asks a complete question. */
export const questionCore = (input, { preserveCase = false } = {}) => {
  const original = String(input ?? '').trim();
  if (original.length > MAX_QUESTION_LENGTH) {
    return original;
  }
  let core = original;
  for (let count = 0; count < 4; count++) {
    const prefix = core.match(ACK_PREFIX);
    const withoutAck =
      prefix && ackOnly(prefix[1]) ? core.slice(prefix[0].length) : core;
    const next = withoutAck.replace(CONNECTOR, '').replace(POLITE, '').trim();
    if (next === core || !isQuestion(next)) {
      break;
    }
    core = next;
  }
  return core === original || !core
    ? original
    : preserveCase
      ? core
      : core[0].toUpperCase() + core.slice(1);
};

// Anchored whole-message reminders cannot hide an appended new task.
const REMINDER =
  /^(?:(?:здравствуйте|привет|hello|hi)[.!]\s*)?(?:(?:к сожалению,?\s*)?не дождал(?:ась|ся|ись) (?:вашего )?ответа[.!]\s*)?(?:мы можем продолжить (?:наше )?общение(?: по вакансии)?|можем продолжить(?: (?:наше )?общение)?|вы (?:еще |ещё )?здесь|(?:can|could) we continue(?: (?:our |the )?conversation)?|are you (?:still )?there|क्या हम बातचीत जारी रख सकते हैं|我们可以继续(?:交流|对话)吗)[?？.!।。！\s]*$/iu;
export const isQuestionReminder = (text) =>
  typeof text === 'string' && text.length <= 1200 && REMINDER.test(text.trim());

const CONSENT_WORDS = new Set(
  'yes no yeah yep sure okay ok yes of course let s lets continue please thanks thank you maybe perhaps da да нет конечно ага угу хорошо ок давайте продолжим продолжать общение спасибо благодарю не уверен уверена возможно हाँ हां जी नहीं ठीक जारी रखें धन्यवाद 是 好的 继续 是的 不 谢谢'.split(
    ' '
  )
);
export const isContinuationConsent = (text) => {
  if (typeof text !== 'string' || text.length > 120) {
    return false;
  }
  const tokens = words(text);
  return (
    tokens.length > 0 &&
    tokens.length <= 10 &&
    tokens.every((word) => CONSENT_WORDS.has(word))
  );
};

export const isStandaloneGreeting = (text) =>
  typeof text === 'string' &&
  text.length <= 100 &&
  /^(?:здравствуйте|привет|добрый (?:день|вечер)|доброе утро|hello|hi|good (?:morning|afternoon|evening)|नमस्ते|你好|您好)[.!。！।\s]*$/iu.test(
    text.trim()
  );

const DETAILS =
  /(?:^|[.!?]\s*)(?:расскажи(?:те)?|опиши(?:те)?|поделись|поделитесь|приведи(?:те)? (?:пример|примеры)|(?:please\s+)?(?:describe|share|tell (?:me|us)|provide examples)|(?:कृपया\s+)?[^।.!?\r\n]{0,100}अनुभव[^।.!?\r\n]{0,60}(?:बताएं|बताइए|साझा करें)|请(?:介绍|描述|分享)[^。！？\r\n]{0,100})/iu;
const AFFIRMATIVE =
  /^(?:да(?: конечно)?|yes(?: of course)?|yeah|yep|sure|ага|угу|конечно|हाँ|हां|जी(?: हाँ)?|是|是的)$/iu;
export const sufficientAnswer = (question, text) =>
  !DETAILS.test(questionCore(question)) ||
  !AFFIRMATIVE.test(words(text).join(' '));
