/**
 * Greeting detection (issue #35).
 *
 * A greeting is a message that carries nothing but a "hi": `Привет!`,
 * `hello there`, `你好`, `नमस्ते`, `xin chào`, a waving-hand emoji, or a
 * sticker from the greeting catalogue. The Russian pattern is ported
 * verbatim from konard/vk-bot `triggers/greeting.js` (public domain),
 * where it has been answering real VK dialogs; the other languages
 * follow the same shape — the whole message must be greeting words,
 * optional addressees ("тебе", "everyone") and punctuation, so
 * "hi, can you review my PR?" is a question, not a greeting.
 */

const NOT_LETTER = '[^\\p{L}]*';

const whole = (words, tail = '') =>
  new RegExp(
    `^${NOT_LETTER}((${words})${NOT_LETTER})+(${NOT_LETTER}(${tail}))?${NOT_LETTER}$`,
    'ui'
  );

/** Waving and greeting gestures; every pattern below accepts them too. */
export const greetingEmoji = ['👋', '🖐', '🖖', '🙋', '🤚', '✋', '🙌'];

const EMOJI = greetingEmoji.join('|');

/**
 * One pattern per language. Keys are BCP-47 primary tags so a contact's
 * detected language can pick the matching reply text later.
 */
export const greetingPatterns = {
  // konard/vk-bot greetingRegex, unchanged apart from being split out.
  ru: /^[^\p{L}]*((трям|🖖|👋|🖐|мо[иё] приветстви[ея]|салам|салют|з?д[ао]ров[ао]?|ку|q+|шалом|хай|хэллоу|йоу?|привет(ствую|ики?)?|здрав?с(твуй|ь)?(те)?|дд|((день|вечер)[^\p{L}]+)?добр(ый([^\p{L}]*(день|вечер))?|ое[^\p{L}]*утро|ой[^\p{L}]*ночи|ого[^\p{L}]*времени[^\p{L}]*суток))[^\p{L}]*)+([^\p{L}]*(тебе|вам))?[^\p{L}]*$/iu,
  en: whole(
    `${EMOJI}|hi+|hello+|helo|hey+|heya|hiya|howdy|yo|sup|greetings|hallo|good[^\\p{L}]*(morning|afternoon|evening|day)|what'?s[^\\p{L}]*up`,
    'there|all|everyone|everybody|guys|folks|friend|mate'
  ),
  zh: whole(
    `${EMOJI}|你好|您好|嗨|哈喽|哈囉|早上好|早安|晚上好|下午好|大家好`,
    '啊|呀'
  ),
  hi: whole(
    `${EMOJI}|नमस्ते|नमस्कार|प्रणाम|हाय|हैलो|हेलो|राम[^\\p{L}]*राम|namaste|namaskar`,
    'जी|ji'
  ),
  vi: whole(
    `${EMOJI}|xin[^\\p{L}]*chào|chào|chao|alo|hế[^\\p{L}]*lô`,
    'bạn|anh|chị|em|cả[^\\p{L}]*nhà|mọi[^\\p{L}]*người'
  ),
};

/**
 * Returns the language tag of the first matching pattern, or null.
 * Emoji-only greetings report `'und'` (undetermined) because a wave
 * says nothing about the language to answer in.
 * @param {string} text
 * @returns {string|null}
 */
export const detectGreetingLanguage = (text) => {
  const value = String(text ?? '').trim();
  if (!value) {
    return null;
  }
  if (!/\p{L}/u.test(value)) {
    return greetingEmoji.some((emoji) => value.includes(emoji)) ? 'und' : null;
  }
  for (const [lang, pattern] of Object.entries(greetingPatterns)) {
    if (pattern.test(value)) {
      return lang;
    }
  }
  return null;
};

/**
 * True when `text` is nothing but a greeting.
 * @param {string} text
 */
export const isGreetingText = (text) => detectGreetingLanguage(text) !== null;

/**
 * True when a normalized message link carries a greeting: either its
 * body is a greeting, or it is a sticker whose id is in `stickerIds`
 * or whose emoji is a greeting gesture.
 * @param {{body?: string, sticker?: {id?: string, emoji?: string}}} message
 * @param {Set<string>} [stickerIds]
 */
export const isGreetingMessage = (message, stickerIds = new Set()) => {
  if (isGreetingText(message?.body)) {
    return true;
  }
  const sticker = message?.sticker;
  if (!sticker) {
    return false;
  }
  if (sticker.id && stickerIds.has(String(sticker.id))) {
    return true;
  }
  return Boolean(
    sticker.emoji &&
    greetingEmoji.some((emoji) => sticker.emoji.includes(emoji))
  );
};
