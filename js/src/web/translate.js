import { dictionaries, DEFAULT_LOCALE } from './locales/index.js';

const lookup = (locale, key) => {
  const dict = dictionaries[locale];
  if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key];
  }
  return undefined;
};

// ICU MessageFormat's plural subset, so English can say "1 draft" and
// "2 drafts" in one string: {count, plural, one {# draft} other {# drafts}}.
// `#` is the number as the language writes it (1,364 · 1 364), as ICU
// writes it; the category comes from Intl.PluralRules.
const PLURAL = /\{(\w+), plural,((?:\s*(?:=\d+|\w+) \{[^{}]*\})+)\s*\}/g;
const PLURAL_CASE = /(=\d+|\w+) \{([^{}]*)\}/g;

const pluralize = (template, vars, locale) =>
  template.replace(PLURAL, (match, name, body) => {
    const n = Number(vars[name]);
    if (!Object.prototype.hasOwnProperty.call(vars, name) || Number.isNaN(n)) {
      return match;
    }
    const cases = Object.fromEntries(
      [...body.matchAll(PLURAL_CASE)].map(([, k, v]) => [k, v])
    );
    const text =
      cases[`=${n}`] ??
      cases[new Intl.PluralRules(locale).select(n)] ??
      cases.other ??
      match;
    return text.replace(/#/g, new Intl.NumberFormat(locale).format(n));
  });

const interpolate = (template, vars, locale) => {
  if (!vars) {
    return template;
  }
  return pluralize(template, vars, locale).replace(
    /\{(\w+)\}/g,
    (match, name) => {
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return String(vars[name]);
      }
      return match;
    }
  );
};

export const translate = (locale, key, vars) => {
  const direct = lookup(locale, key);
  if (typeof direct === 'string') {
    return interpolate(direct, vars, locale);
  }
  const fallback = lookup(DEFAULT_LOCALE, key);
  if (typeof fallback === 'string') {
    return interpolate(fallback, vars, DEFAULT_LOCALE);
  }
  return key;
};
