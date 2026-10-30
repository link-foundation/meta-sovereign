// Shared, conservative communication rules; no contact-specific identifiers.
const W = '[\\p{L}\\p{M}\\p{N}_]';
export const phrase = (value) =>
  new RegExp(`(?<!${W})(?:${value})(?!${W})`, 'iu');

export const PROFESSIONS = [
  [
    'programmer',
    'программист\\p{L}*|разработчик\\p{L}*|software (?:developer|engineer)|programmer|developer|coder|程序员|开发者|प्रोग्रामर|डेवलपर',
  ],
  ['designer', 'дизайнер\\p{L}*|designer'],
  ['engineer', 'инженер\\p{L}*|engineer'],
  ['teacher', 'учител\\p{L}*|преподавател\\p{L}*|teacher'],
  ['doctor', 'врач\\p{L}*|doctor'],
  ['student', 'студент\\p{L}*|student'],
  ['manager', 'менеджер\\p{L}*|manager'],
  ['analyst', 'аналитик\\p{L}*|analyst'],
  ['recruiter', 'рекрутер\\p{L}*|recruiter'],
].map(([kind, pattern]) => ({ kind, regex: phrase(pattern) }));

export const professionIn = (text) => {
  for (const rule of PROFESSIONS) {
    const match = String(text ?? '').match(rule.regex);
    if (match) {
      return { kind: rule.kind, value: match[0].toLocaleLowerCase() };
    }
  }
  return null;
};

const NEGATIVE = phrase(
  'нет|неа|не надо|не стоит|не хочу|не будем|не являюсь|не работаю|не программист|не разработчик|no|nope|not really|I am not|I.m not|不是|不想|नहीं'
);
const POSITIVE = phrase(
  'да|ага|угу|давай|давайте|конечно|можно|ок|окей|хорошо|без проблем|го|есть|yes|yeah|yep|sure|okay|ok|indeed|I am|I do|是的|可以|好啊|हाँ'
);
const UNCERTAIN = phrase(
  'может|возможно|наверное|потом|как-нибудь|maybe|perhaps|later|可能|शायद'
);
const THIRD_PERSON = phrase('мой друг|моя подруга|он|она|my friend|he|she');

// This is evidence of agreement only, never truth for a different question.
export const affirmation = (text) => {
  const value = String(text ?? '').trim();
  if (NEGATIVE.test(value)) {
    return false;
  }
  if (UNCERTAIN.test(value) || THIRD_PERSON.test(value)) {
    return null;
  }
  return POSITIVE.test(value) ? true : null;
};
export const friendshipProposal = (text) =>
  phrase(
    'будем дружить|давай(?:те)? дружить|станем друзьями|давай(?:те)? будем друзьями|let.s be friends|(?:can|shall|could) we be friends|want to be friends|做朋友|交个朋友|दोस्त बनें'
  ).test(String(text ?? ''));

export const accountNetwork = (text) => {
  const value = String(text ?? '');
  for (const [network, pattern] of [
    ['github', 'github|гитхаб\\p{L}*'],
    ['gitlab', 'gitlab|гитлаб\\p{L}*'],
    ['linkedin', 'linkedin|линкедин\\p{L}*'],
    ['email', 'e-?mail|почт(?:а|у|ы|ой|е)'],
  ]) {
    if (phrase(pattern).test(value)) {
      return network;
    }
  }
  return null;
};
export const linkRequest = (text) =>
  phrase('ссылк\\p{L}*|профил\\p{L}*|link|profile|url|链接|लिंक').test(
    String(text ?? '')
  );
export const quotedOrForwarded = (message) =>
  Boolean(
    message?.forwardedFrom ||
    message?.forwarded ||
    /^\s*>/u.test(String(message?.body ?? ''))
  );
