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

/**
 * Longest common subsequence of two token arrays.
 * Returns the actual subsequence, not just its length, so it can be used
 * as the alignment skeleton when synthesising regexes.
 */
export const lcs = (a, b) => {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.unshift(a[i - 1]);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return out;
};

/**
 * Detect the dominant character class for a set of varying tokens, so
 * `inferRegexLcs` can emit `\d+`, `[a-z]+`, `[A-Z]+`, `\w+` instead of
 * the conservative `\S+`. Falls back to `\S+` when no class fits.
 */
const charClass = (tokens) => {
  if (tokens.every((t) => /^\d+$/.test(t))) {
    return '\\d+';
  }
  if (tokens.every((t) => /^[a-z]+$/.test(t))) {
    return '[a-z]+';
  }
  if (tokens.every((t) => /^[A-Z]+$/.test(t))) {
    return '[A-Z]+';
  }
  if (tokens.every((t) => /^\w+$/.test(t))) {
    return '\\w+';
  }
  return '\\S+';
};

/**
 * Stronger example-driven regex synthesiser:
 *  1. Reduce all examples to their pairwise LCS skeleton (common tokens).
 *  2. Between consecutive common tokens, emit `(?:<charclass>(?:\s+<charclass>)*)`
 *     when the gaps in every example are non-empty, or `.*` when at least
 *     one example has an empty gap.
 *  3. When no common skeleton survives, fall back to alternation of escaped
 *     literals (anchored, case-insensitive).
 */
export const inferRegexLcs = (examples) => {
  if (!examples?.length) {
    throw new Error('inferRegexLcs: at least one example is required');
  }
  const tokenised = examples.map(tokenise);
  let skeleton = tokenised[0];
  for (let i = 1; i < tokenised.length; i += 1) {
    skeleton = lcs(skeleton, tokenised[i]);
  }
  if (skeleton.length === 0) {
    return new RegExp(`^(?:${examples.map((e) => escape(e)).join('|')})$`, 'i');
  }
  const parts = [];
  const cursor = tokenised.map(() => 0);
  for (let s = 0; s < skeleton.length; s += 1) {
    const tok = skeleton[s];
    const gaps = tokenised.map((toks, idx) => {
      const start = cursor[idx];
      const end = toks.indexOf(tok, start);
      cursor[idx] = end + 1;
      return toks.slice(start, end);
    });
    if (gaps.some((g) => g.length > 0)) {
      const flat = gaps.flat();
      const cls = flat.length === 0 ? '\\S+' : charClass(flat);
      parts.push(
        gaps.every((g) => g.length > 0)
          ? `${cls}(?:\\s+${cls})*\\s+`
          : '.*?\\s*'
      );
    }
    parts.push(escape(tok));
    if (s < skeleton.length - 1) {
      parts.push('\\s+');
    }
  }
  // Trailing gap after the last skeleton token.
  const tailGaps = tokenised.map((toks, idx) => toks.slice(cursor[idx]));
  if (tailGaps.some((g) => g.length > 0)) {
    const flat = tailGaps.flat();
    const cls = flat.length === 0 ? '\\S+' : charClass(flat);
    parts.push(
      tailGaps.every((g) => g.length > 0) ? `\\s+${cls}(?:\\s+${cls})*` : '.*?'
    );
  }
  return new RegExp(`^${parts.join('')}$`, 'i');
};

/**
 * Tiny PEG-style sequence rule: an array of literals, classes, and named
 * captures. Rendered to a regex on demand. Useful for hand-crafted
 * patterns that benefit from named groups feeding the facts extractor.
 */
export const compilePeg = (rule) => {
  const parts = rule.map((p) => {
    if (typeof p === 'string') {
      return escape(p);
    }
    if (p.literal) {
      return escape(p.literal);
    }
    if (p.capture) {
      return `(?<${p.capture}>${p.class ?? '\\S+'})`;
    }
    if (p.class) {
      return p.class;
    }
    if (p.optional) {
      return `(?:${compilePeg(p.optional).source})?`;
    }
    return '\\S+';
  });
  return new RegExp(`^${parts.join('\\s*')}$`, 'i');
};
