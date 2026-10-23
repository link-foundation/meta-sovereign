// Formulas of rich messages and Instant View pages (R-Y225; learned,
// never copied): LaTeX drawn as MathML by KaTeX, which the browser itself
// typesets (no fonts and no style sheet needed). KaTeX is asked for only
// when a formula is on screen (a dynamic import, so a build that splits
// code loads it then; the single-file build has it inside) and every
// failure leaves the LaTeX as written.

const MAX_SOURCE = 20000;

let loading = null;

/** KaTeX, loaded once; null when it cannot be loaded. */
export const loadKatex = () => {
  loading ??= import('katex')
    .then((mod) => mod.default ?? mod)
    .catch(() => null);
  return loading;
};

const done = new Map();

const typeset = (katex, text, display) => {
  try {
    return (
      katex?.renderToString(text, {
        output: 'mathml',
        displayMode: Boolean(display),
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        maxExpand: 1000,
        maxSize: 50,
      }) ?? ''
    );
  } catch {
    return '';
  }
};

const keyOf = (source, display) => `${display ? 'b' : 'i'}:${source}`;

/** The MathML kept for a formula already drawn, else null. */
export const cachedMath = (source, display) =>
  done.get(keyOf(source, display)) ?? null;

/**
 * The MathML markup (a `<span class="katex">` holding a `<math>`) for
 * LaTeX `source`; '' when it cannot be drawn (too long, a LaTeX error, no
 * KaTeX), which callers answer by showing the source.
 */
export const mathMl = async (source, display = false) => {
  const text = String(source ?? '');
  const key = keyOf(text, display);
  if (done.has(key)) {
    return done.get(key);
  }
  const katex = text.length > MAX_SOURCE ? null : await loadKatex();
  const html = typeset(katex, text, display);
  // With throwOnError false KaTeX marks what it could not read; the
  // source stays visible then instead of a red error.
  const ok = html.includes('<math') && !html.includes('katex-error');
  done.set(key, ok ? html : '');
  return ok ? html : '';
};
