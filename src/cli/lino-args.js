/**
 * Tiny `lino-arguments`-compatible parser (R-F2).
 *
 * Accepts both `--key value` and `--key=value`. Boolean flags are
 * single tokens like `--auto`. Positional arguments are returned in
 * `_`. This is a stand-in for the real `lino-arguments` package; it
 * satisfies the prototype's CLI without taking a dep before the npm
 * package is published.
 */

export const parseArgs = (argv) => {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (!tok.startsWith('--')) {
      out._.push(tok);
      continue;
    }
    const body = tok.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[body] = true;
    } else {
      out[body] = next;
      i += 1;
    }
  }
  return out;
};
