// Behavior researched at konard/vk-bot 175d2d13218d9e791ae2f3e824a0d24f10319dcb.
// This bounded whole-message recognizer is independent of its regex builder.
import { greetingDestinationReason } from '../greetings/plan.js';
import {
  personalReplyDraft,
  latestReplyMessage,
  replyVariantIndex,
} from './personal-reply.js';
export {
  latestReplyMessage as latestGratitudeMessage,
  replyFingerprint as gratitudeFingerprint,
} from './personal-reply.js';

export const gratitudeStickerIds = Object.freeze([
  '6342',
  '66407',
  '57689',
  '53771',
  '100140',
  '95564',
  '74836',
  '13457',
  '61452',
  '17925',
  '89254',
  '76589',
  '54085',
  '51599',
  '71370',
  '66424',
  '12995',
  '15897',
  '3698',
  '68782',
  '13428',
  '58613',
  '12673',
  '10253',
  '65703',
  '94568',
  '20406',
  '6164',
  '51266',
  '94594',
  '86140',
  '91892',
  '88368',
  '72149',
  '94365',
  '86539',
  '73618',
  '65091',
]);
const stickers = new Set(gratitudeStickerIds);
const gratitudeWord =
  /^(?:с?п[аов]сиб(?:[оа]+(?:чки)?|ки)?|спс|сяб|бла[гн]одар(?:ю|им|очка)|благого|spasibo|thanks?)$/u;
const contextWords = new Set(
  (
    'константин костя кость костян привет приветик здравствуй здравствуйте ' +
    'добрый доброго день дня вечер и огромнейшее огромное большое bolshoye ' +
    'вам вас те тебе тебя дорогой дорогая бро брат сударь мужик друг мой моя ' +
    'хороший хорошая от всей души за добрые теплые поздравление поздравления ' +
    'слова внимание пожелание пожелания мне очень приятно обнял поднял добра ' +
    'любви твоему дому сердечно you'
  ).split(' ')
);

export const isGratitudeMessage = (message) => {
  if (stickers.has(String(message?.sticker?.id ?? ''))) {
    return true;
  }
  const body = message?.body;
  if (typeof body !== 'string' || body.length > 1024 || body.includes('?')) {
    return false;
  }
  const words =
    body
      .toLowerCase()
      .normalize('NFKC')
      .replaceAll('ё', 'е')
      .replace(/[’']/gu, '')
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!words.length || words.length > 64) {
    return false;
  }
  const core =
    words.some((word) => gratitudeWord.test(word)) ||
    /(?:^| )от (?:всей )?души(?: |$)/u.test(words.join(' '));
  return (
    core &&
    words.every((word) => gratitudeWord.test(word) || contextWords.has(word))
  );
};

export const gratitudeOptions = (action) => {
  const ids = action.stickerIds ?? ['60075', '89452'];
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 100 ||
    ids.some((id) => !/^[1-9]\d{0,9}$/u.test(String(id)))
  ) {
    throw new Error(
      'gratitude stickerIds needs 1–100 positive numeric identifiers'
    );
  }
  return {
    preferSticker: action.preferSticker !== false,
    stickerIds: [...new Set(ids.map(String))],
  };
};

export const gratitudeMessageReason = (
  message,
  isSelf = (sender) => sender === 'me'
) => {
  if (
    !message ||
    !message.id?.startsWith('msg:') ||
    message.deleted ||
    message.service ||
    message.outgoing === true ||
    message.out === true ||
    message.out === 1 ||
    isSelf(message.sender)
  ) {
    return 'gratitude-incoming-required';
  }
  if (
    message.source !== 'vk' ||
    greetingDestinationReason({ ...message, network: message.source })
  ) {
    return 'personal-chat-required';
  }
  return isGratitudeMessage(message) ? null : 'gratitude-message-required';
};

export const gratitudeDraft = (automation, candidate, draft, isSelf) => {
  const message = latestReplyMessage(candidate.messages);
  if (!message) {
    return { reason: 'gratitude-incoming-required' };
  }
  const id = automation.action.preferSticker
    ? automation.action.stickerIds[
        replyVariantIndex(message.id, automation.action.stickerIds.length)
      ]
    : null;
  return personalReplyDraft(
    automation,
    candidate,
    {
      ...draft,
      ...(id ? { text: '', sticker: { id }, prefill: null } : {}),
    },
    isSelf,
    'gratitude',
    gratitudeMessageReason
  );
};
