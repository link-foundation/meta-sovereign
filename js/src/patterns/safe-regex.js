/**
 * Running a stored or user-written pattern without freezing the server
 * (R-Z1, ReDoS). A catastrophic pattern such as `(a+)+$` takes longer than
 * the age of the universe on a long line, and a regex runs on the main
 * thread, where it would stop the scheduler and every account too.
 *
 *   - a pattern is at most MAX_PATTERN_LENGTH characters;
 *   - the text it is tried on is cut to MAX_INPUT_LENGTH characters;
 *   - the match runs under a time budget (`node:vm` stops a script that
 *     runs too long, the regex engine included). Where `node:vm` does not
 *     exist (a browser) only the two caps apply.
 *
 * A match that runs out of time is "no match", never a hang.
 *
 * The time budget costs a watchdog per call (~50 microseconds), and
 * patterns run in loops over thousands of messages, so only a pattern with
 * a shape that can blow up pays it: a quantified group that holds a
 * quantifier or an alternation (`(a+)+`, `(a|b)*`), two or more
 * unbounded `.*`, or a back-reference. The rest run directly.
 */

export const MAX_PATTERN_LENGTH = 500;
export const MAX_INPUT_LENGTH = 10_000;
export const REGEX_BUDGET_MS = 50;

const vm = globalThis.process?.getBuiltinModule?.('node:vm') ?? null;
const sandbox = vm ? vm.createContext({ re: null, input: '' }) : null;
const script = vm ? new vm.Script('re.test(input)') : null;

const UNBOUNDED = /^(?:[*+]|\{\d+,\d*\})/;

// A back-reference, or two or more unbounded `.*`.
const looksHeavy = (source) =>
  /\\[1-9]|\\k</.test(source) ||
  (source.match(/\.(?:[*+]|\{\d+,\})/g) ?? []).length > 1;

// What one character does to the stack of open groups (each entry: does
// that group hold a quantifier or `|`?). Returns true for a quantified
// group that holds one.
const step = (open, source, i) => {
  const ch = source[i];
  if (ch === '(') {
    open.push(false);
  } else if (ch === ')') {
    const holds = open.pop() ?? false;
    if (holds && UNBOUNDED.test(source.slice(i + 1))) {
      return true;
    }
    if (holds && open.length > 0) {
      open[open.length - 1] = true;
    }
  } else if (
    open.length > 0 &&
    (ch === '|' || UNBOUNDED.test(source.slice(i)))
  ) {
    open[open.length - 1] = true;
  }
  return false;
};

// Whether the pattern has a shape that can take exponential or high
// polynomial time (see the header).
const shapeIsRisky = (source) => {
  if (looksHeavy(source)) {
    return true;
  }
  const open = [];
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\\') {
      i += 1;
    } else if (inClass) {
      inClass = source[i] !== ']';
    } else if (source[i] === '[') {
      inClass = true;
    } else if (step(open, source, i)) {
      return true;
    }
  }
  return false;
};

const risky = new WeakMap();
const isRisky = (regex) => {
  if (!risky.has(regex)) {
    risky.set(regex, shapeIsRisky(regex.source));
  }
  return risky.get(regex);
};

/** A RegExp for a stored/user pattern, or a coded Error when too long/invalid. */
export const safeRegExp = (source, flags = 'i') => {
  const text = String(source ?? '');
  if (text.length > MAX_PATTERN_LENGTH) {
    throw Object.assign(
      new Error(`pattern is longer than ${MAX_PATTERN_LENGTH} characters`),
      { code: 'unsafe-pattern' }
    );
  }
  return new RegExp(text, flags);
};

/** The same, or null when the pattern cannot be used. */
export const safeRegExpOrNull = (source, flags) => {
  try {
    return safeRegExp(source, flags);
  } catch {
    return null;
  }
};

/**
 * `regex.test(text)` on at most MAX_INPUT_LENGTH characters within the
 * time budget; false when it runs out of time.
 */
export const safeTest = (
  regex,
  text,
  { budgetMs = REGEX_BUDGET_MS, maxInput = MAX_INPUT_LENGTH } = {}
) => {
  const input = String(text ?? '').slice(0, maxInput);
  if (!script || !isRisky(regex)) {
    return regex.test(input);
  }
  sandbox.re = regex;
  sandbox.input = input;
  try {
    return script.runInContext(sandbox, { timeout: budgetMs });
  } catch (error) {
    if (error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      return false;
    }
    throw error;
  } finally {
    sandbox.re = null;
    sandbox.input = '';
  }
};
