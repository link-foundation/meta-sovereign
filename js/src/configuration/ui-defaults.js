/** Public presentation defaults shared by desktop, serve and the browser. */
export const THEME_MODES = ['system', 'light', 'dark', 'auto'];
export const SKINS = ['t3', 'telegram', 'whatsapp', 'signal'];
export const UI_DEFAULT_CHOICES = {
  theme: THEME_MODES,
  skin: SKINS,
  language: ['system', 'en', 'ru', 'zh', 'hi'],
};

export const validUiDefault = (key, value) =>
  Object.hasOwn(UI_DEFAULT_CHOICES, key) &&
  UI_DEFAULT_CHOICES[key].includes(value);

export const validateUiDefaults = (value) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.entries(value).some(([key, item]) => !validUiDefault(key, item))
  ) {
    throw Object.assign(new Error('Invalid interface defaults.'), {
      code: 'INVALID_UI_DEFAULTS',
    });
  }
  return { ...value };
};
