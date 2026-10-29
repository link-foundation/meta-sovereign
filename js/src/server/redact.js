/**
 * Secrets never reach a log line or a stored error (R-Z2).
 *
 * `redact(text)` blanks what looks like a credential: Telegram Bot API
 * tokens (they sit in the URL path, `/bot<id>:<secret>/`), `Authorization`
 * / `Cookie` header values, `Bearer` / `Basic` credentials, query or JSON
 * fields such as `access_token`, `session` or `password`, and very long
 * base64 runs (a Telegram string session). It is applied to every log line
 * by the logger and to the error messages the automation ledger stores.
 * The result keeps its shape, so a line still reads: `bot<redacted>`.
 */

const MARK = '<redacted>';

const FIELDS =
  'access_token|refresh_token|id_token|auth_token|bearer|token|api_?key|apikey|' +
  'client_secret|secret|password|passwd|passphrase|pass|pwd|session|sessionid|' +
  'session_string|string_session|code_verifier|credentials?|csrf|signature';

// Order matters: the most specific shapes first.
const RULES = [
  // https://api.telegram.org/bot123456:ABC.../getMe, file/bot... too
  [/(\/(?:file\/)?bot)\d{3,}:[A-Za-z0-9_-]{20,}/g, `$1${MARK}`],
  // a bare bot token
  [/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, MARK],
  // header lines and JSON header fields: Authorization: Bearer xxx
  [
    /((?:proxy-)?authorization|cookie|set-cookie|x-api-key|x-auth-token)(\\?["']?\s*[:=]\s*\\?["']?)(?:(?:Bearer|Basic|Token|Digest)\s+)?[^\s",;}\\']+/gi,
    `$1$2${MARK}`,
  ],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/g, `$1 ${MARK}`],
  // query strings and form bodies: access_token=xxx
  [new RegExp(`([?&;\\s](?:${FIELDS}))=[^&\\s"'<>]+`, 'gi'), `$1=${MARK}`],
  // JSON string fields: "password":"xxx"
  [
    new RegExp(
      `(\\\\?"(?:${FIELDS})\\\\?"\\s*:\\s*\\\\?")(?:[^"\\\\]|\\\\.)*?(\\\\?")`,
      'gi'
    ),
    `$1${MARK}$2`,
  ],
  // user:password@host in a URL
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@"]+:)[^\s/@"]+@/gi, `$1${MARK}@`],
  // long base64 runs (a string session is ~350 characters)
  [/[A-Za-z0-9+/_-]{160,}={0,2}/g, MARK],
];

export const redact = (text) => {
  if (typeof text !== 'string' || text.length === 0) {
    return text;
  }
  let out = text;
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
};

/** A credential-redacted summary, without frames from string-thrown stacks. */
export const safeMessage = (error) => {
  const message =
    typeof error?.message === 'string'
      ? error.message
      : typeof error === 'string'
        ? error
        : 'unknown error';
  // Upstream libraries can throw a stack string or put it in `message`.
  // Responses and stored summaries need only its first line; private logs
  // can retain structured, credential-redacted diagnostic fields separately.
  return redact(message.split(/\r?\n/, 1)[0]);
};
