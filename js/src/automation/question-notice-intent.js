import { asksQuestion, questionWords } from './question-match.js';
import { passiveNotice, noticeCore } from './question-notices.js';
import { completedAnswerSummary } from './question-summary.js';
import { textLinks } from '../message-links.js';
import {
  questionAction,
  questionInvitation,
} from './question-action-intent.js';

const REJECTION =
  /(?:не готовы (?:двигаться дальше|продолжать|пригласить)|не можем пригласить|выбрали другого кандидата|решение отказать|вынуждены отказать)|\b(?:we (?:have )?(?:chosen|selected) another|we (?:will not|cannot|can't|won't) (?:proceed|move forward|invite)|your (?:application|candidacy) (?:was|has been) (?:rejected|declined))\b|आपका आवेदन अस्वीकृत|我们(?:无法继续|选择了其他候选人)|您的申请已被拒绝/iu;
const DECLINED_INVITATION =
  /\bwe (?:will not|cannot|can't|won't) invite(?: you)?(?: (?:for|to) (?:an? )?interview)?\b|не (?:готовы|можем) пригласить(?: вас)?(?: на собеседование)?/giu;
const NONFINAL_REJECTION =
  /\b(?:until|unless|if you|(?:chosen|selected) another(?!\s+(?:candidate|applicant)\b))\b|\b(?:can(?:not|'t)|will not|won't) (?:proceed|move forward) (?:without|if)\b|(?:если вы|пока вы не)|जब तक|除非|如果/iu;
const REJECTION_FOLLOW_UP =
  /(?:^|[.!]\s+)(?:please[, ]+)?(?:share|describe|tell (?:us|me)|let (?:us|me) know)\b|(?:расскажите|опишите|поделитесь|уточните|сообщите)(?!\p{L})/iu;
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

export const noticeHasLink = ({ body, links }) =>
  Boolean(links?.length) ||
  textLinks(body, { includeFileNames: true }).length > 0;

export const passiveRejection = (message) =>
  rejectionNotice(message.body) &&
  !NONFINAL_REJECTION.test(message.body) &&
  !REJECTION_FOLLOW_UP.test(message.body) &&
  !noticeHasLink(message) &&
  !noticeAddsTask(message.body);

export const completedHandover = (text) =>
  !noticeAddsTask(text) &&
  /^(?:(?:спасибо за ответы[.!]\s*)?(?:мы передали (?:их|ваши ответы) работодателю|ваши ответы (?:переданы|отправлены) работодателю)|работа (?:ии[- ]помощника|робота[- ]рекрутера) завершена|your answers have been forwarded to the employer|the recruiter bot has finished|आपके उत्तर नियोक्ता को भेज दिए गए हैं|您的回答已转交给雇主)[.!。！\s]*$/iu.test(
    text.trim()
  );

/** Only explicit completed wrap-ups can disappear from pending notice context. */
export const completedNotice = (text) =>
  completedAnswerSummary(text) || completedHandover(text);

export const handoverAnswer = (text) =>
  !questionAction.test(text) &&
  !questionInvitation.test(text) &&
  /^(?:есть ли|есть у вас|был[аио]? ли|работали ли|можете ли|do you|are you|can you|have you)\s+[^\r\n?？]{3,480}[?？]\s*[:：]\s*(?:да|нет|yes|no)[.!。！\s]*$/iu.test(
    text.trim()
  );
