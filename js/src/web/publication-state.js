const KEY = 'metaSovereignPublicationDraft';
const freshId = () => globalThis.crypto.randomUUID();
export const newPublicationDraft = () => ({
  text: '',
  targetIds: [],
  requestId: freshId(),
  pending: null,
  debug: false,
});
export const readPublicationDraft = (storage) => {
  try {
    const value = JSON.parse(
      (storage ?? globalThis.localStorage)?.getItem(KEY) ?? 'null'
    );
    if (
      typeof value?.text === 'string' &&
      Array.isArray(value.targetIds) &&
      typeof value.requestId === 'string'
    ) {
      return value;
    }
  } catch {
    /* A blocked store must not prevent composing. */
  }
  return newPublicationDraft();
};
export const savePublicationDraft = (value, storage) => {
  try {
    const target = storage ?? globalThis.localStorage;
    if (typeof target?.setItem !== 'function') {
      return false;
    }
    target.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
export const matchesPublicationPreview = (shown, next) =>
  shown?.requestId === next?.requestId &&
  shown?.text === next?.text &&
  Boolean(shown?.debug) === Boolean(next?.debug) &&
  JSON.stringify(shown?.targets) === JSON.stringify(next?.targets) &&
  JSON.stringify(shown?.capabilities) === JSON.stringify(next?.capabilities);
export const publicationRead = (answer) => {
  if (
    !answer ||
    answer.error ||
    answer.code === 'server-required' ||
    answer.httpStatus >= 400
  ) {
    throw Object.assign(
      new Error(answer?.error ?? 'Publication service unavailable'),
      { code: answer?.code ?? 'server-required' }
    );
  }
  return answer;
};
export const hasUncertainPublication = (record) =>
  ['unknown', 'sending'].includes(record?.status) ||
  record?.results?.some((entry) =>
    ['unknown', 'sending'].includes(entry.status)
  );
