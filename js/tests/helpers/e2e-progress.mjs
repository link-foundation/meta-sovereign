import { assert } from './e2e-chat.mjs';

export const assertProgress = async (locator, percent) => {
  const measured = await locator.evaluate((track) => {
    const fill = track.querySelector('.progress-fill');
    const style = globalThis.getComputedStyle(fill);
    return {
      value: track.getAttribute('aria-valuenow'),
      percent:
        (100 * fill.getBoundingClientRect().width) /
        track.getBoundingClientRect().width,
      fg: style.backgroundColor,
      bg: globalThis.getComputedStyle(track).backgroundColor,
      transition: style.transitionDuration,
    };
  });
  assert(
    Number(measured.value) === percent,
    `accessible progress: ${JSON.stringify(measured)}`
  );
  assert(
    Math.abs(measured.percent - percent) < 0.1,
    `painted progress: ${JSON.stringify(measured)}`
  );
  assert(
    measured.transition.split(',').every((part) => parseFloat(part) === 0),
    'numeric progress must not lag behind its label'
  );
  const luminance = (color) =>
    color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        const c = n / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const fg = luminance(measured.fg),
    bg = luminance(measured.bg);
  const contrast = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  assert(
    contrast >= 3,
    `progress needs 3:1 fill/track contrast: ${contrast}, ${JSON.stringify(measured)}`
  );
};
