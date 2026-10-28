// The pure parts of chat themes (R-Y170; learned, never copied): Telegram's
// colour ints as CSS, and what a theme sets in a chat for the mode the app
// is in. A theme's colours are `{ base, accent, outgoing, messages }` for
// light and for dark (the server keeps them as Telegram sent them).

/** A colour int (0xRRGGBB, maybe signed or with alpha) as `#rrggbb`. */
export const cssColour = (value) =>
  `#${(Number(value) & 0xffffff).toString(16).padStart(6, '0')}`;

const luminanceOf = (value) => {
  const n = Number(value) & 0xffffff;
  const channel = (shift) => {
    const c = ((n >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
};

/** Black or white, whichever reads better on `value` (a colour int). */
export const readableOn = (value) => {
  const light = luminanceOf(value) + 0.05;
  return light / (luminanceOf(0x101418) + 0.05) > 1.05 / light
    ? '#101418'
    : '#ffffff';
};

/** A hue-preserving fill with at least 4.5:1 contrast under white text. */
export const whiteTextFill = (value) => {
  const n = Number(value) & 0xffffff;
  for (let scale = 100; scale >= 0; scale -= 1) {
    const shade = [16, 8, 0].reduce(
      (out, shift) =>
        out | (Math.floor((((n >> shift) & 255) * scale) / 100) << shift),
      0
    );
    if (1.05 / (luminanceOf(shade) + 0.05) >= 4.5) {
      return cssColour(shade);
    }
  }
  return '#000000';
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
    vars['--chat-accent-fill'] = whiteTextFill(settings.accent);
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
        text:
          vars['--bubble-out-text'] ??
          readableOn(Number.parseInt(vars['--chat-accent'].slice(1), 16)),
      }
    : null;
};
