/**
 * Patterns module (R-C1).
 *
 * Two primitives:
 *   - `inferRegex(examples)` produces a regex that matches every
 *     example by tokenising on whitespace and replacing varying tokens
 *     with `\S+`. This is a simple but real example-driven generaliser
 *     — enough to demo the workflow; deeper synthesis (REGAE,
 *     SplitRegex) is a follow-up.
 *   - `simplifyRegex(regex)` collapses `(\S+\s+){2}\S+` style
 *     repetitions into `(\S+\s+){n}` form for readability.
 *
 * `Pattern` itself is a small data class so it can be persisted as a
 * link in the unified database.
 */

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const tokenise = (s) => s.split(/\s+/).filter(Boolean);

export const inferRegex = (examples) => {
  if (!examples?.length) {
    throw new Error('inferRegex: at least one example is required');
  }
  const tokenised = examples.map(tokenise);
  const len = tokenised[0].length;
  if (!tokenised.every((t) => t.length === len)) {
    return new RegExp(`^(?:${examples.map((e) => escape(e)).join('|')})$`, 'i');
  }
  const parts = [];
  for (let i = 0; i < len; i += 1) {
    const col = tokenised.map((t) => t[i]);
    if (col.every((c) => c === col[0])) {
      parts.push(escape(col[0]));
    } else {
      parts.push('\\S+');
    }
  }
  return new RegExp(`^${parts.join('\\s+')}$`, 'i');
};

export const simplifyRegex = (regex) => {
  const src = regex.source.replace(
    /(\\S\+\\s\+){2,}/g,
    (m) => `(?:\\S+\\s+){${m.length / 8}}`
  );
  return new RegExp(src, regex.flags);
};

export const matchAll = (regex, messages) =>
  messages.filter((m) =>
    regex.test(typeof m === 'string' ? m : (m.body ?? ''))
  );

export const createPattern = ({ id, examples, label }) => ({
  id: `pattern:${id}`,
  tokens: ['pattern', id, label ?? ''],
  children: [],
  regex: inferRegex(examples),
  examples,
});
