import { assert } from './e2e-chat.mjs';
import { cloudVars } from '../../src/web/cloud-theme-model.js';

// Exercise actual CSS classes across all built-in appearances, including
// controls that normally live in dialogs, calls and Mini Apps.
const FILLED = [
  'primary',
  'selection-top-button',
  'audio-play',
  'reader-tab active',
  'calendar-day is-chosen',
  'bot-button is-primary',
  'bot-button is-success',
  'bot-button is-danger',
  'sticker-set-add',
  'share-tab is-active',
  'web-app-button',
  'voice-join',
  'private-call-btn accept',
  'private-call-btn end',
  'chat-filter-unread',
  'chat-item-unread',
  'chat-item-mark',
  'chat-down-count',
  'file-icon',
  'poll-mark',
  'composer-scheduled-count',
  'chat-topic-icon',
  'chat-topic-unread',
  'invite-initial',
  'member-initial',
  'account-unread',
  'sticker-new',
];

export const assertFilledContrast = async (page) => {
  const before = await page.evaluate(() => ({
    ...document.documentElement.dataset,
  }));
  const theme = { dark: { accent: 0xffffff }, light: { accent: 0xffff00 } };
  for (const mode of ['dark', 'light']) {
    for (const skin of ['t3', 'telegram', 'whatsapp', 'signal', 'cloud']) {
      const vars = skin === 'cloud' ? cloudVars(theme, mode === 'dark') : {};
      const failures = await page.evaluate(
        ({ mode, skin, vars, classes }) => {
          const root = document.documentElement;
          root.dataset.theme = mode;
          root.dataset.skin = skin === 'cloud' ? 't3' : skin;
          const holder = document.createElement('div');
          Object.entries(vars).forEach(([name, value]) =>
            root.style.setProperty(name, value)
          );
          document.body.append(holder);
          const luminance = (rgb) =>
            rgb
              .slice(0, 3)
              .map((n) => {
                const c = n / 255;
                return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
          const failures = [];
          for (const name of classes) {
            const node = document.createElement('button');
            node.className = name;
            node.textContent = '12';
            holder.append(node);
            const style = globalThis.getComputedStyle(node);
            const channels = (color) => color.match(/[\d.]+/g).map(Number);
            const fg = luminance(channels(style.color));
            const bg = luminance(channels(style.backgroundColor));
            const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
            if (ratio < 4.5) {
              failures.push({
                name,
                ratio,
                fg: style.color,
                bg: style.backgroundColor,
              });
            }
          }
          holder.remove();
          Object.keys(vars).forEach((name) => root.style.removeProperty(name));
          return failures;
        },
        { mode, skin, vars, classes: FILLED }
      );
      assert(
        failures.length === 0,
        `${skin}/${mode} filled contrast: ${JSON.stringify(failures)}`
      );
    }
  }
  await page.evaluate(
    (before) => Object.assign(document.documentElement.dataset, before),
    before
  );
};

export const pixelsAt = async (page, points) => {
  const png = await page.screenshot();
  return page.evaluate(
    async ({ data, points }) => {
      const picture = new globalThis.Image();
      picture.src = `data:image/png;base64,${data}`;
      await picture.decode();
      const canvas = document.createElement('canvas');
      canvas.width = picture.width;
      canvas.height = picture.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(picture, 0, 0);
      return points.map(([x, y]) =>
        Array.from(ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data)
      );
    },
    { data: png.toString('base64'), points }
  );
};
