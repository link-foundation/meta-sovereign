import { codedError, markSendOutcome } from './http.js';

const isTimeout = (error) =>
  ['AbortError', 'TimeoutError'].includes(error?.name);
const outcomeError = (error, ambiguous, status) =>
  Object.assign(markSendOutcome(error, { ambiguous, status }), {
    ...(ambiguous ? { code: 'send-unknown', outcome: 'unknown' } : {}),
    fallback: false,
  });

export const telegramBotFetch = (fetchImpl, write) => async (url, init) => {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    // Leave timeout retry/budget handling to timedRequest. Do not expose the
    // token-bearing URL potentially embedded in a transport error's message.
    if (isTimeout(error)) {
      throw error;
    }
    throw outcomeError(
      Object.assign(new Error('Telegram connection failed'), { cause: error }),
      write
    );
  }
};

const ambiguousStatus = (status) => status >= 500 || status === 408;
const readPayload = async (res, write) => {
  try {
    return await res.json();
  } catch (error) {
    if (isTimeout(error)) {
      throw error;
    }
    throw outcomeError(
      codedError('Telegram returned an unreadable response', 'bad-response'),
      write && (res.ok || ambiguousStatus(res.status)),
      res.status
    );
  }
};

const refusal = (method, payload, res, write) => {
  const status = Number(payload?.error_code) || res.status;
  const error = codedError(
    `telegram ${method}: ${payload?.description ?? `HTTP ${res.status}`}`,
    status === 429 ? 'rate-limited' : 'telegram-api'
  );
  if (Number(payload?.parameters?.retry_after) > 0) {
    error.retryAfter = Number(payload.parameters.retry_after);
  }
  return outcomeError(
    error,
    write && (ambiguousStatus(res.status) || ambiguousStatus(status)),
    status
  );
};

export const consumeTelegramBot = (method, write) => async (res) => {
  const payload = await readPayload(res, write);
  if (!res.ok || payload?.ok === false) {
    throw refusal(method, payload, res, write);
  }
  if (payload?.ok !== true) {
    throw outcomeError(
      codedError('Telegram returned no API acknowledgement', 'bad-response'),
      write,
      res.status
    );
  }
  return payload.result;
};
