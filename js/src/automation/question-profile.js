// Owner-provided values, never executable templates.
export const PROFILE_KEY = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/u;
export const normalizeAnswerProfile = (input = {}) => {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).length > 100
  ) {
    throw new Error('answer profile must contain at most 100 fields');
  }
  for (const [key, value] of Object.entries(input)) {
    if (
      !PROFILE_KEY.test(key) ||
      typeof value !== 'string' ||
      value.length > 2000
    ) {
      throw new Error('invalid answer profile field');
    }
  }
  return { ...input };
};

export const renderAnswer = (text, profile) => {
  const missing = [];
  const rendered = text.replace(
    /\{\{([a-zA-Z][a-zA-Z0-9_.-]{0,63})\}\}/gu,
    (placeholder, key) => {
      if (!Object.hasOwn(profile, key) || !String(profile[key]).trim()) {
        missing.push(key);
        return placeholder;
      }
      return String(profile[key]);
    }
  );
  return { text: rendered, missing: [...new Set(missing)] };
};
