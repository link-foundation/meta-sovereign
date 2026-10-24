// What the message box has for emoji, in one place (R-Y104, R-Y105,
// R-Y206, R-Y214): the panel with its Stickers and GIFs tabs and the trending
// custom emoji, and the emoji suggested while ":word" is typed.

import { useEmojiPanel } from './chat-emoji.js';
import { useEmojiSuggest } from './chat-emoji-suggest.js';
import { useStickerTabs } from './chat-stickers.js';
import { useGroupSets } from './chat-group-stickers.js';

// Telegram's words for emoji (R-Y117), when a Telegram user account is
// there: for the emoji panel's search and the ":word" suggestions.
const emojiKeywordsOf = (state, api) =>
  state.telegram?.kind === 'user' &&
  typeof api?.telegramEmojiKeywords === 'function'
    ? (lang) => api.telegramEmojiKeywords({ lang })
    : null;

// Premium emoji, the group's pack and Telegram's emoji groups (R-Y214),
// for a Telegram user account.
const customOf = (state, api, groupSets) =>
  state.current?.source === 'telegram' &&
  state.telegram?.kind === 'user' &&
  typeof api?.telegramEmojiPanelInfo === 'function' &&
  typeof api?.telegramStickerSets === 'function'
    ? {
        api,
        groupSet: groupSets.emojis?.shortName ? groupSets.emojis : null,
      }
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
  const groupSets = useGroupSets(state.current?.key, state.info);
  const emoji = useEmojiPanel({
    box,
    setText,
    extra: stickers.tabs,
    keywords,
    featured: stickers.featuredEmoji,
    custom: customOf(state, api, groupSets),
  });
  const suggest = useEmojiSuggest({ text, box, setText, keywords });
  return { stickers, emoji, suggest };
};
