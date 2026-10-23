// The pure parts of chat themes (R-Y170; learned, never copied): Telegram's
// colour ints as CSS, and what a theme sets in a chat for the mode the app
// is in. A theme's colours are `{ base, accent, outgoing, messages }` for
// light and for dark (the server keeps them as Telegram sent them).

/** A colour int (0xRRGGBB, maybe signed or with alpha) as `#rrggbb`. */
export const cssColour = (value) =>
  `#${(Number(value) & 0xffffff).toString(16).padStart(6, '0')}`;

/** Black or white, whichever reads better on `value` (a colour int). */
export const readableOn = (value) => {
  const n = Number(value) & 0xffffff;
  const channel = (shift) => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.4 ? '#101418' : '#ffffff';
};

const isColour = (value) => typeof value === 'number' && Number.isFinite(value);

/** The colours a theme has for a mode (the other if it lacks that one). */
export const settingsFor = (theme, dark) =>
  (dark ? (theme?.dark ?? theme?.light) : (theme?.light ?? theme?.dark)) ??
  null;

/**
 * The CSS custom properties a theme sets for the open chat: the accent,
 * and the outgoing bubble (its first message colour, else the outgoing
 * accent) with text that reads on it. `{}` when it has neither.
 */
export const themeVars = (theme, dark) => {
  const settings = settingsFor(theme, dark);
  if (!settings) {
    return {};
  }
  const vars = {};
  if (isColour(settings.accent)) {
    vars['--chat-accent'] = cssColour(settings.accent);
  }
  const bubble = isColour(settings.messages?.[0])
    ? settings.messages[0]
    : settings.outgoing;
  if (isColour(bubble)) {
    vars['--bubble-out'] = cssColour(bubble);
    vars['--bubble-out-text'] = readableOn(bubble);
  }
  return vars;
};

/** What a picker tile shows of a theme: `{ accent, bubble, text }` or null. */
export const previewOf = (theme, dark) => {
  const vars = themeVars(theme, dark);
  return vars['--chat-accent'] || vars['--bubble-out']
    ? {
        accent: vars['--chat-accent'] ?? vars['--bubble-out'],
        bubble: vars['--bubble-out'] ?? vars['--chat-accent'],
        text: vars['--bubble-out-text'] ?? '#ffffff',
      }
    : null;
};
