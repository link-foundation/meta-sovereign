// What the message box has for emoji, in one place (R-Y104, R-Y105,
// R-Y206): the panel with its Stickers and GIFs tabs and the trending
// custom emoji, and the emoji suggested while ":word" is typed.

import { useEmojiPanel } from './chat-emoji.js';
import { useEmojiSuggest } from './chat-emoji-suggest.js';
import { useStickerTabs } from './chat-stickers.js';

// Telegram's words for emoji (R-Y117), when a Telegram user account is
// there: for the emoji panel's search and the ":word" suggestions.
const emojiKeywordsOf = (state, api) =>
  state.telegram?.kind === 'user' &&
  typeof api?.telegramEmojiKeywords === 'function'
    ? (lang) => api.telegramEmojiKeywords({ lang })
    : null;

/**
 * `{ stickers, emoji, suggest }` for a message box: `box` is the
 * textarea's ref, `text` its text, `typeText` types into it.
 */
export const useEmojiTools = ({
  state,
  api,
  composer,
  box,
  text,
  typeText: setText,
}) => {
  const keywords = emojiKeywordsOf(state, api);
  const stickers = useStickerTabs({ state, api, composer });
  const emoji = useEmojiPanel({
    box,
    setText,
    extra: stickers.tabs,
    keywords,
    featured: stickers.featuredEmoji,
  });
  const suggest = useEmojiSuggest({ text, box, setText, keywords });
  return { stickers, emoji, suggest };
};
