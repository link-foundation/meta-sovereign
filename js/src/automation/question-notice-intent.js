import { asksQuestion, questionWords } from './question-match.js';
import { passiveNotice, noticeCore } from './question-notices.js';
import { completedAnswerSummary } from './question-summary.js';
import {
  questionAction,
  questionInvitation,
} from './question-action-intent.js';

const REJECTION =
  /(?:не готовы (?:двигаться дальше|продолжать|пригласить)|не можем пригласить|выбрали другого кандидата|решение отказать|вынуждены отказать)|\b(?:we (?:have )?(?:chosen|selected) another|we (?:will not|cannot|can't|won't) (?:proceed|move forward|invite)|your (?:application|candidacy) (?:was|has been) (?:rejected|declined))\b|आपका आवेदन अस्वीकृत|我们(?:无法继续|选择了其他候选人)|您的申请已被拒绝/iu;
const DECLINED_INVITATION =
  /\bwe (?:will not|cannot|can't|won't) invite(?: you)?(?: (?:for|to) (?:an? )?interview)?\b|не (?:готовы|можем) пригласить(?: вас)?(?: на собеседование)?/giu;
const ACKNOWLEDGEMENT =
  /(?:отклик|резюме|кандидатур[\p{L}]*).{0,100}(?:рассмотр|получ|изуч)|(?:рассмотр|получ|изуч).{0,100}(?:отклик|резюме|кандидатур[\p{L}]*)|\b(?:application|resume|résumé|candidacy)\b.{0,100}\b(?:received|review|reviewing|consider|considering)\b|\b(?:received|review|reviewing|consider|considering)\b.{0,100}\b(?:application|resume|résumé|candidacy)\b|(?:आवेदन|बायोडाटा).{0,80}(?:प्राप्त|समीक्षा|विचार)|(?:申请|简历).{0,80}(?:收到|审核|考虑)/iu;

export const rejectionNotice = (text) =>
  typeof text === 'string' && text.length <= 6000 && REJECTION.test(text);

export const noticeIntent = (text) => {
  if (rejectionNotice(text)) {
    return 'rejections';
  }
  if (questionInvitation.test(text)) {
    return 'invitations';
  }
  return passiveNotice(text) &&
    !questionAction.test(text) &&
    questionWords(text).length <= 80 &&
    ACKNOWLEDGEMENT.test(noticeCore(text).replace(/\s+/gu, ' '))
    ? 'acknowledgements'
    : null;
};

export const noticeAddsTask = (text) =>
  asksQuestion(text) ||
  questionAction.test(text) ||
  questionInvitation.test(text.replace(DECLINED_INVITATION, ''));

/** Only explicit completed wrap-ups can disappear from pending notice context. */
export const completedNotice = (text) =>
  completedAnswerSummary(text) ||
  (!noticeAddsTask(text) &&
    /^(?:работа (?:ии[- ]помощника|робота[- ]рекрутера) завершена|ваши ответы переданы работодателю|your answers have been forwarded to the employer|the recruiter bot has finished|आपके उत्तर नियोक्ता को भेज दिए गए हैं|您的回答已转交给雇主)[.!。！\s]*$/iu.test(
      text.trim()
    ));
