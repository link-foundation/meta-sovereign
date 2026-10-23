// Emoji suggested while typing ":word" in the message box, as Telegram
// Desktop does (R-Y206; learned, never copied): after a colon and at least
// two letters, at the start of the text or after a space, a strip over the
// box offers the emoji for the word, by Telegram's words in the page's
// language (messages.getEmojiKeywords, brought up to date by
// getEmojiKeywordsDifference on the server) and then by English names.
// A click, Tab or Enter puts the chosen emoji in place of ":word"; the
// arrow keys move in the strip and Escape closes it.

import React, { useEffect, useMemo, useState } from 'react';
import { useT } from './i18n.js';
import { findEmoji, insertAtCaret, useKeywords } from './chat-emoji.js';

const el = React.createElement;

const MAX_SUGGESTED = 8;
const WORD = /(?:^|\s)(:([\p{L}\p{N}_+-]{2,32}))$/u;
const STEPS = { ArrowDown: 1, ArrowUp: -1 };

/**
 * The word being typed after a colon at the caret: `{ word, start }`
 * (`start` where the colon is), else null.
 */
export const colonWord = (text, caret = String(text ?? '').length) => {
  const before = String(text ?? '').slice(0, caret);
  const found = WORD.exec(before);
  return found
    ? { word: found[2], start: before.length - found[1].length }
    : null;
};

/** The emoji to offer for `word`: Telegram's words first, then names. */
export const suggestedEmoji = (word, keywords = null) =>
  findEmoji(word, MAX_SUGGESTED, keywords).map((item) => item.emoji);

// Where the caret is: the box's, when it is the focused one.
const caretOf = (box, text) => {
  const area = box?.current;
  const focused = area && globalThis.document?.activeElement === area;
  return focused && Number.isInteger(area.selectionStart)
    ? area.selectionStart
    : text.length;
};

const Strip = ({ items, index, onPick, onHover }) => {
  const t = useT();
  return el(
    'div',
    {
      className: 'emoji-suggest',
      role: 'listbox',
      'aria-label': t('chat.extras.suggestEmoji'),
    },
    items.map((emoji, i) =>
      el(
        'button',
        {
          key: emoji,
          type: 'button',
          role: 'option',
          className:
            i === index ? 'emoji-suggest-item active' : 'emoji-suggest-item',
          'data-emoji-suggest': emoji,
          'aria-selected': i === index ? 'true' : 'false',
          onMouseDown: (event) => event.preventDefault(),
          onMouseEnter: () => onHover(i),
          onClick: () => onPick(emoji),
        },
        emoji
      )
    )
  );
};

/**
 * The composer's part: `{ list, onKey }`. `box` is the textarea's ref,
 * `setText` sets its text, `keywords(lang)` asks Telegram's words (or is
 * null); `onKey(event)` is true when it took the key.
 */
export const useEmojiSuggest = ({ text, box, setText, keywords }) => {
  const [index, setIndex] = useState(0);
  const [closedAt, setClosedAt] = useState(null);
  const typing = colonWord(text, caretOf(box, text));
  const words = useKeywords(keywords, typing !== null);
  const items = useMemo(
    () => (typing ? suggestedEmoji(typing.word, words) : []),
    [typing?.word, words]
  );
  const shown = items.length > 0 && closedAt !== text;
  useEffect(() => setIndex(0), [typing?.word]);
  const pick = (emoji) => {
    const area = box.current;
    if (!area || !typing) {
      return;
    }
    const to = caretOf(box, text);
    area.focus();
    area.setSelectionRange?.(typing.start, to);
    insertAtCaret(area, emoji, setText);
    setClosedAt(null);
  };
  const onKey = (event) => {
    if (!shown || event.shiftKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    const step = STEPS[event.key];
    if (step) {
      setIndex((index + step + items.length) % items.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      pick(items[Math.min(index, items.length - 1)]);
    } else if (event.key === 'Escape') {
      setClosedAt(text);
    } else {
      return false;
    }
    event.preventDefault();
    return true;
  };
  return {
    onKey,
    list: shown
      ? el(Strip, {
          key: 'emoji-suggest',
          items,
          index: Math.min(index, items.length - 1),
          onPick: pick,
          onHover: setIndex,
        })
      : null,
  };
};
