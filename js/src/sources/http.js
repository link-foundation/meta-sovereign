/**
 * Small HTTP helpers shared by live source adapters.
 *
 * The adapters keep endpoint defaults close to their networks, while
 * tests inject `fetchImpl` and `baseUrl` so no real credentials or
 * network access are required for verification.
 */

export const envValue = (name) => {
  try {
    if (globalThis.process?.env?.[name]) {
      return globalThis.process.env[name];
    }
  } catch {
    // Ignore non-Node runtimes that expose a partial process shim.
  }
  try {
    return globalThis.Deno?.env?.get(name) ?? null;
  } catch {
    return null;
  }
};

export const resolveOption = (value, envName, label) => {
  const resolved = value ?? (envName ? envValue(envName) : null);
  if (!resolved) {
    throw new Error(`${label} is required`);
  }
  return resolved;
};

export const contentText = (content) => {
  if (typeof content === 'string') {
    return content;
  }
  return (
    content?.text ??
    content?.body ??
    content?.message ??
    content?.description ??
    ''
  );
};

export const contentTarget = (content) =>
  typeof content === 'object'
    ? (content.to ?? content.chat ?? content.chatId ?? content.peerId ?? null)
    : null;

export const compact = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  );

export const addSearch = (url, search = {}) => {
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
};

const parseResponseBody = async (res) => {
  const text = await res.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// 5xx and 408 come back after the request was sent: the server may have
// acted on it. Other 4xx answers are clear refusals, nothing was sent
// (429 included: rate limited before acceptance).
const isAmbiguousStatus = (status) => status >= 500 || status === 408;

/**
 * Mark a failed request as "may have been sent" (`ambiguous: true`) or
 * "clearly not sent" (`safeToRetry: true`), so a sender never repeats a
 * possibly delivered message through another route (R-Z4).
 */
export const markSendOutcome = (error, { status, ambiguous }) => {
  const target = error instanceof Error ? error : new Error(String(error));
  if (status !== undefined) {
    target.status = status;
  }
  target.ambiguous = ambiguous === true;
  target.safeToRetry = !target.ambiguous;
  return target;
};

// Outbound time budget (R-Z1). A stalled connection must not hang a paced
// send loop for ever. A READ that times out may be tried again with a
// backoff; a SEND that times out may already have been delivered, so it is
// reported as `send-unknown` (outcome unknown, R-Z4) and never retried or
// sent another way.
export const DEFAULT_TIMEOUT_MS = 30_000;
const READ_METHODS = new Set(['GET', 'HEAD']);
const BACKOFF_MS = 250;

const isTimeout = (error) =>
  error?.name === 'TimeoutError' || error?.name === 'AbortError';

const timeoutSignal = (ms) =>
  ms > 0 && typeof globalThis.AbortSignal?.timeout === 'function'
    ? globalThis.AbortSignal.timeout(ms)
    : undefined;

const pause = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const timeoutError = (cause, write, ms) =>
  write
    ? Object.assign(
        markSendOutcome(
          new Error(
            `request timed out after ${ms} ms; it may have been delivered`
          ),
          { ambiguous: true }
        ),
        { code: 'send-unknown', outcome: 'unknown', fallback: false, cause }
      )
    : Object.assign(new Error(`request timed out after ${ms} ms`), {
        code: 'timeout',
        cause,
      });

const budgetOf = (init, options) => ({
  timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  write:
    options.write ??
    !READ_METHODS.has(String(init?.method ?? 'GET').toUpperCase()),
  retries: options.retries ?? 1,
  sleep: options.sleep ?? pause,
});

/**
 * Run `fetchImpl(url, init)` and `consume(response)` (reading the body)
 * under one time budget.
 * @param {{timeoutMs?: number, write?: boolean, retries?: number,
 *   sleep?: Function}} options `write` defaults to "not GET/HEAD".
 */
export const timedRequest = async (
  fetchImpl,
  url,
  init,
  options = {},
  consume = (res) => res
) => {
  const { timeoutMs, write, retries, sleep } = budgetOf(init, options);
  for (let attempt = 0; ; attempt += 1) {
    const signal = init?.signal ? undefined : timeoutSignal(timeoutMs);
    try {
      const res = await fetchImpl(url, signal ? { ...init, signal } : init);
      return await consume(res);
    } catch (error) {
      if (!isTimeout(error)) {
        throw error;
      }
      if (write || attempt >= retries) {
        throw timeoutError(error, write, timeoutMs);
      }
      await sleep(BACKOFF_MS * 2 ** attempt);
    }
  }
};

export const requestJson = async (
  fetchImpl,
  url,
  {
    method = 'GET',
    headers = {},
    search = null,
    body = undefined,
    timeoutMs,
    write,
    retries,
    sleep,
  } = {}
) => {
  const target = addSearch(new URL(url), search ?? {});
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (body instanceof URLSearchParams || typeof body === 'string') {
      init.body = body;
    } else {
      init.headers['Content-Type'] ??= 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  // A network failure after the request left may still have reached the
  // server: ambiguous (R-Z4). A timeout is handled by timedRequest.
  const send = (url, opts) =>
    fetchImpl(url, opts).catch((error) => {
      throw isTimeout(error)
        ? error
        : markSendOutcome(error, { ambiguous: true });
    });
  return timedRequest(
    send,
    target,
    init,
    { timeoutMs, write, retries, sleep },
    async (res) => {
      let parsed;
      try {
        parsed = await parseResponseBody(res);
      } catch (error) {
        if (isTimeout(error)) {
          throw error;
        }
        throw markSendOutcome(error, {
          ambiguous: res.ok || res.status >= 500,
        });
      }
      if (!res.ok) {
        const detail =
          typeof parsed === 'string' ? parsed : JSON.stringify(parsed ?? {});
        throw markSendOutcome(
          new Error(`HTTP ${res.status} ${res.statusText}: ${detail}`),
          { status: res.status, ambiguous: isAmbiguousStatus(res.status) }
        );
      }
      return parsed;
    }
  );
};

export const authHeaders = (token, prefix = 'Bearer') => ({
  Authorization: `${prefix} ${token}`,
});

/** An error carrying a `code` the page can show (R-Z4). */
export const codedError = (message, code) =>
  Object.assign(new Error(message), { code });

/** The operation does not exist on this network: nothing was done. */
export const unsupportedError = (message) => codedError(message, 'unsupported');

/**
 * The id the API needs out of a chat key such as `room:42`. A bare id
 * passes through; a key with another prefix is not this kind of chat.
 */
export const idFromChat = (chat, prefixes) => {
  const key = String(chat ?? '');
  if (!key) {
    return null;
  }
  const colon = key.indexOf(':');
  if (colon < 0) {
    return key;
  }
  return prefixes.includes(key.slice(0, colon)) ? key.slice(colon + 1) : null;
};

/**
 * The thread id a job board needs to reply. Archive and Habr/SuperJob
 * pulls name a chat `vacancy:<id>`, which is a vacancy, not a thread:
 * sending to it would hit a wrong URL, so say so (R-Z4).
 */
export const threadTarget = (content, thread) => {
  const target = contentTarget(content);
  if (typeof target === 'string' && target.startsWith('vacancy:')) {
    throw codedError(
      `this chat is named after a vacancy (${target}); a reply needs the ${thread} id of the thread`,
      'unsupported-chat'
    );
  }
  return target;
};
