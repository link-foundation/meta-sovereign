// A mark is consumed only after its actual message was shown and acknowledged.
const idsOf = (ids = []) =>
  [...new Set(ids.map(Number))]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((a, b) => a - b);
const pageOf = (answer, confirmed) => {
  if (!answer?.ok) {
    throw new Error(answer?.error ?? 'unread marks unavailable');
  }
  return {
    ids: idsOf(answer.ids),
    total: Number(answer.count ?? answer.ids?.length ?? 0),
    confirmed,
  };
};

export const createUnreadNavigator = ({
  api,
  chat,
  scrollTo,
  localIds = () => [],
  count = () => 0,
  onBusy = () => {},
  onError = () => {},
}) => {
  const queues = new Map();
  let active = true;
  let pending = null;
  const fill = async (kind) => {
    if (queues.get(kind)?.ids.length) {
      return queues.get(kind);
    }
    const local = idsOf(localIds(kind));
    const fromLocal = local.length > 0 && Number(count(kind)) <= local.length;
    const answer = fromLocal
      ? { ok: true, ids: local, count: local.length }
      : await api.telegramUnreadMarks({ chat, kind });
    if (!active) {
      return null;
    }
    const fallback =
      !fromLocal && answer?.ok && answer.ids?.length === 0 && local.length > 0;
    const page = fallback
      ? pageOf({ ok: true, ids: local, count: local.length }, false)
      : pageOf(answer, !fromLocal);
    queues.set(kind, page);
    return page;
  };
  const show = async (kind, queue) => {
    const id = queue.ids[0];
    if (id === undefined) {
      return false;
    }
    const shown = await scrollTo(`msg:telegram:${chat}:${id}`);
    if (!active) {
      return false;
    }
    if (!shown) {
      throw new Error('message is not visible yet');
    }
    const result = await api.telegramReadMarks?.({
      chat,
      kind,
      ids: [id],
      last: queue.confirmed && queue.total <= 1,
    });
    if (!active) {
      return false;
    }
    if (!result?.ok) {
      throw new Error(result?.error ?? 'unread mark not acknowledged');
    }
    queue.ids.shift();
    queue.total = Math.max(0, queue.total - 1);
    return true;
  };
  const advance = async (kind) => {
    if (!active || !chat || typeof api?.telegramUnreadMarks !== 'function') {
      return false;
    }
    onBusy(kind);
    onError(null);
    try {
      const queue = await fill(kind);
      return active && queue ? await show(kind, queue) : false;
    } catch (error) {
      if (active) {
        onError(error);
      }
      return false;
    } finally {
      if (active) {
        onBusy(null);
      }
    }
  };
  return {
    next(kind) {
      pending ??= advance(kind).finally(() => {
        pending = null;
      });
      return pending;
    },
    stop() {
      active = false;
      queues.clear();
    },
  };
};
