import { textLinks } from '../message-links.js';

const RECEIVED_RU =
  /^(?:(?:мы )?получили ваш(?:е)? (?:отклик|резюме)|ваш отклик (?:мы )?получили|ваш(?:е)? (?:отклик|резюме) получен[оа]?)$/iu;
const RECEIVED_EN =
  /^(?:(?:we(?:'ve| have)? )received your (?:application|cv|r[eé]sum[eé])|your (?:application|cv|r[eé]sum[eé]) (?:was|has been) received)$/iu;
const REVIEW_EN =
  /^(?:(?:your (?:application|cv|r[eé]sum[eé]|candidacy)) (?:(?:is|remains) (?:currently )?under review|is being (?:reviewed|considered))|(?:(?:we|our team) (?:will|are going to) |we(?:'re| are) currently )(?:(?:carefully )?(?:review|consider|look over)|reviewing|considering) your (?:application|cv|r[eé]sum[eé]|experience)(?: (?:now|shortly|soon|this week|over the next few days))?)$/iu;
const FOLLOW_UP_EN =
  /^(?:(?:(?:we|our team) (?:will |may )?|we'll )?(?:(?:get back to|reach out to|contact|write to) you|get back to you with (?:feedback|our decision)|let you know (?:our decision|the outcome)|update you with (?:feedback|our decision))(?: (?:soon|shortly|later|next week|within (?:two|2|a few) (?:business )?days))?(?: if your (?:skills|experience|application) (?:is a match|matches our needs|fits the role))?)$/iu;
const REVIEW_RU =
  /^(?:(?:(?:мы |наша команда )?(?:обязательно |внимательно )?(?:рассмотрим|изучим|ознакомимся с)|компания [\p{L}\p{N} «»"-]{1,60} рассмотрит) (?:ваш(?:е|им|у)? )?(?:резюме|кандидатуру|отклик)(?: на вакансию [\p{L}\p{N} /()+«»"-]{1,65})?(?: (?:в ближайшее время|в течение (?:двух|2|нескольких) рабочих дней|в ближайшие дни|как можно скорее))?|ваш(?:е|а)? (?:резюме|кандидатура|отклик) (?:(?:сейчас )?рассматривается|(?:(?:сейчас )?находится )?на (?:этапе )?рассмотрени[ияи])|(?:мы )?продолжаем рассматривать кандидатов и анализировать результаты собеседований)$/iu;
const SCREENING_RU =
  /^(?:(?:мы )?(?:проводим|вед[её]м) (?:первичный |предварительный )?отбор|ид[её]т (?:первичный |предварительный )?отбор)(?: кандидатов)? по резюме$/iu;
const DELAY_RU =
  /^нам (?:нужно (?:немного )?времени|потребуется (?:немного )?врем(?:я|ени)), чтобы (?:ознакомиться с вашим резюме|изучить ваше резюме|рассмотреть вашу кандидатуру)(?: и решить, какие этапы предложить)?$/iu;
const FOLLOW_UP_RU =
  /^(?:(?:(?:мы |наша команда |мы сами )?(?:обязательно )?(?:свяж(?:емся|ется) с вами|свяжемся с теми, чей опыт подойд[её]т|напишем (?:вам|им|подходящим кандидатам)|напишем или позвоним подходящим кандидатам|верн[её]мся с обратной связью|дадим обратную связь)|(?:постараемся|планируем) вернуться с (?:фидбеком|обратной связью)|(?:позже )?сообщи[мт] (?:вам )?о сво[её]м решении)(?: для обсуждения деталей)?(?: (?:как можно скорее|позже|позднее|в ближайшее время|на следующей неделе))?(?:, если (?:ваш )?опыт подойд[её]т)?|(?:если (?:навыки и опыт (?:подойдут|покажутся нам подходящими) для (?:данной )?позиции|ваш опыт совпад[её]т с нашими задачами|оно заинтересует нас|мы примем положительное решение)|когда выберем подходящих кандидатов)(?:,| [—–]| --) (?:(?:мы |наша команда )?(?:обязательно )?свяж(?:емся|ется) с вами(?: для обсуждения деталей)?(?: в ближайшее время)?|напишем им))$/iu;

const CONTACT_RU =
  /^(?:при[её]м входящих звонков временно приостановлен|входящие звонки пока не принимаем|(?:пожалуйста, )?не звоните(?:: мы сами (?:напишем или позвоним|напишем) подходящим кандидатам)?)$/iu;
const NOTES_RU = [
  /^(?:большое )?спасибо за (?:(?:ваш )?отклик|интерес к (?:нашей )?вакансии|ваше желание построить свою карьеру в нашей команде)$/iu,
  /^благодарим (?:вас )?за (?:честные ответы чат-боту|(?:проявленный )?интерес к (?:нашей )?вакансии|отклик(?: на вакансию [\p{L}\p{N} /()+«»"-]{1,100})?)$/iu,
  /^благодарим (?:вас )?за проявленный интерес к нашей компании [\p{L}\p{N} «»"-]{1,60}, а также за участие в процессе отбора на позицию [\p{L}\p{N} /()+«»"-]{1,70}$/iu,
  /^мы ценим время и усилия, которые вы вложили в знакомство с нами$/iu,
  /^ваша кандидатура оста[её]тся в числе тех, кто нас заинтересовал$/iu,
  /^(?:хорошего дня|всего доброго)$/iu,
  CONTACT_RU,
];
const NOTES_EN = [
  /^(?:thank you|thanks) for (?:applying|your application|your interest(?: in (?:this|the|our) (?:position|role|vacancy))?)$/iu,
  /^have a (?:good|great|nice) day$/iu,
];
const GUIDED_INFO =
  /^вы (?:также )?можете узнать больше о нас и ознакомиться с другими вакансиями по ссылке:\s*https:\/\/hh\.ru\/employer\/\d{1,15}$/iu;
const EMPLOYER_URL = /^https:\/\/hh\.ru\/employer\/\d{1,15}$/u;
const MARKED_SIGNATURE =
  /^(?:с уважением|с наилучшими пожеланиями|best regards|kind regards|regards),?\s*$/iu;
const SIGNATURE_NAME =
  /^(?:[\p{Lu}][\p{L}\p{N}«»&-]{1,28})(?:\s+[\p{L}\p{N}«»&-]{2,28}){0,3}$/u;
const BARE_RU_NAME =
  /^(?:[А-ЯЁ][а-яё]{2,25} )[А-ЯЁ][а-яё]{2,25}(?:ова|ева|ина|ская|ов|ев|ин|ский|ич|ко)$/u;
const COMMAND_IN_NAME =
  /(?:йте|ьтесь|ите|ься|итесь)(?:\s|$)|\b(?:upload|attach|enter|submit|type|add|download)\b/iu;
const ADDED_TASK =
  /\b(?:upload|attach|submit|download|enter your|take a test|call us|book a|please (?:fill|send|reply|confirm))\b|(?:^|[^\p{L}])(?:пришлите|отправьте|загрузите|заполните|внесите|перейдите|пройдите|укажите|предоставьте|ответьте|позвоните|созвонитесь|подтвердите|прикрепите|свяжитесь)(?!\p{L})/iu;
const GREETING =
  /^(?:(?:здравствуйте|добрый день|добрый вечер|доброе утро)(?:,\s*[\p{Lu}][\p{L}\p{M} -]{1,55})?|(?:[\p{Lu}][\p{L}\p{M}-]*(?:\s+[\p{Lu}][\p{L}\p{M}-]*){0,2}),\s*здравствуйте|(?:hello|hi|dear)(?:[,\s]+[\p{Lu}][\p{L}\p{M} -]{1,55})?)[!.](?:\s+|$)/iu;

const optionalCompanyLink = (body, links, source) => {
  const textual = textLinks(body, { includeFileNames: true });
  if (!textual.length && !links?.length) {
    return '';
  }
  const url = textual[0]?.replace(/\.$/u, '');
  return source === 'hh' &&
    textual.length === 1 &&
    EMPLOYER_URL.test(url ?? '') &&
    (!links?.length || (links.length === 1 && links[0] === url))
    ? url
    : null;
};

const clauses = (body, url) => {
  const placeholder = '\uFFFC';
  return (url ? body.replace(url, placeholder) : body)
    .trim()
    .replace(GREETING, '')
    .split(/[.!。！\r\n]+/u)
    .map((part) => (url ? part.replace(placeholder, url) : part).trim())
    .filter(Boolean);
};

const withoutSignature = (parts, body) => {
  const last = parts.at(-1);
  if (last && !COMMAND_IN_NAME.test(last)) {
    if (
      MARKED_SIGNATURE.test(parts.at(-2) ?? '') &&
      SIGNATURE_NAME.test(last)
    ) {
      return parts.slice(0, -2);
    }
    const signoff = last.match(
      /^(?:с уважением|с наилучшими пожеланиями|best regards|kind regards|regards),\s+(.+)$/iu
    );
    if (
      (signoff && SIGNATURE_NAME.test(signoff[1])) ||
      (BARE_RU_NAME.test(last) &&
        body.trim().split(/\r?\n/u).at(-1)?.trim() === last)
    ) {
      return parts.slice(0, -1);
    }
  }
  return parts;
};

const removeTimeRu = (part) =>
  part.replace(
    /^(?:сейчас|в данный момент|на данный момент|в течение (?:двух|2|нескольких) рабочих дней),? /iu,
    ''
  );
const RU = {
  review: (part) =>
    [REVIEW_RU, SCREENING_RU, DELAY_RU, RECEIVED_RU].some((pattern) =>
      pattern.test(removeTimeRu(part))
    ),
  followUp: FOLLOW_UP_RU,
  note: NOTES_RU,
  separator: /\s*(?:,? и |,\s+)/giu,
};
const EN = {
  review: (part) => REVIEW_EN.test(part) || RECEIVED_EN.test(part),
  followUp: FOLLOW_UP_EN,
  note: NOTES_EN,
  separator: /\s*(?:,? and |,\s+)/giu,
};

const clauseKind = (part, { review, followUp, note, separator }, url) => {
  if (review(part)) {
    return 'review';
  }
  if (followUp.test(part) || note.some((pattern) => pattern.test(part))) {
    return 'context';
  }
  if (url && GUIDED_INFO.test(part)) {
    return 'company-info';
  }
  for (const match of part.matchAll(separator)) {
    const left = part.slice(0, match.index);
    const right = part.slice(match.index + match[0].length);
    if (review(left) && followUp.test(right)) {
      return 'review';
    }
    if (
      (review(left) && review(`We ${right}`)) ||
      (note.some((pattern) => pattern.test(left)) &&
        clauseKind(right, { review, followUp, note: [], separator }) ===
          'review')
    ) {
      return 'review';
    }
  }
  return null;
};

/** A positive status clause and an allowlist for every accompanying clause. */
export const recognizedAcknowledgement = ({ body, links }, source) => {
  if (
    !body ||
    body.length > 1600 ||
    /[?？<>@…*\uFFFC]/u.test(body) ||
    ADDED_TASK.test(body)
  ) {
    return null;
  }
  const url = optionalCompanyLink(body, links, source);
  if (url === null) {
    return null;
  }
  const parts = withoutSignature(clauses(body, url), body);
  if (!parts.length || parts.length > 12) {
    return null;
  }
  for (const [language, grammar] of Object.entries({ ru: RU, en: EN })) {
    const kinds = parts.map((part) => clauseKind(part, grammar, url));
    if (
      kinds.every(Boolean) &&
      kinds.includes('review') &&
      (!url || kinds.includes('company-info'))
    ) {
      return language;
    }
  }
  return null;
};

export const savedAcknowledgementThanks = (text, language) => {
  if (typeof text !== 'string' || text.length > 240) {
    return false;
  }
  return language === 'ru'
    ? /^(?:(?:здравствуйте|добрый день)[,!.]\s*)?(?:спасибо(?: большое)?|большое спасибо|благодарю(?: вас)?)(?: за (?:ответ|информацию|обратную связь|сообщение))?(?:[,!.]\s*(?:ожидаю|буду ждать(?: (?:вашего ответа|обратной связи))?|жду обратной связи))?[.!]*$/iu.test(
        text.trim()
      )
    : /^(?:(?:hello|hi)[,!.]\s*)?(?:thanks(?: very much)?|thank you(?: very much)?)(?: for (?:the (?:reply|update|information)|getting back to me|letting me know))?(?:(?:[,!.]|\s+and)\s+(?:i(?:'ll| will) wait|i look forward to hearing from you))?[.!]*$/iu.test(
        text.trim()
      );
};
