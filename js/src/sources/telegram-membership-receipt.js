// A resolved RPC alone cannot establish membership. Layer 232 wraps join
// updates; older layers return Updates directly (whose `updates` is an array).
const kind = (value) =>
  String(value?.className ?? '')
    .split('.')
    .pop();
const text = (value) => String(value?.value ?? value ?? '');
export const traceTelegramMembership = (env, operation, receipt) => {
  if (process.env.MS_TELEGRAM_MEMBERSHIP_DEBUG === '1') {
    env.log?.({
      level: 'debug',
      event: 'telegram_membership_result',
      operation,
      confirmed: receipt.ok === true,
      code: receipt.code ?? null,
    });
  }
};
export const telegramWriteFailure = (fallback) => (error) =>
  typeof error?.errorMessage === 'string' && error.errorMessage
    ? fallback(error)
    : { ok: false, code: 'outcome-unknown' };
export const telegramOperationUpdates = (answer) => {
  const result =
    kind(answer) === 'ChatInviteJoinResultOk' ? answer.updates : answer;
  return ['Updates', 'UpdatesCombined'].includes(kind(result)) &&
    Array.isArray(result.chats) &&
    Array.isArray(result.updates)
    ? result
    : null;
};
export const telegramJoinedReceipt = (answer, expected = null) => {
  if (kind(answer) === 'ChatInviteJoinResultWebView') {
    return { ok: false, code: 'join-web-view-required' };
  }
  const updates = telegramOperationUpdates(answer);
  const chats = (updates?.chats ?? []).filter(
    (chat) =>
      ['Channel', 'Chat'].includes(kind(chat)) &&
      /^[1-9]\d{0,19}$/.test(text(chat.id)) &&
      !chat.left &&
      !chat.kicked &&
      !chat.deactivated
  );
  const ids = [
    ...new Set(
      chats.map(
        (chat) => `${kind(chat) === 'Channel' ? '-100' : '-'}${text(chat.id)}`
      )
    ),
  ];
  const chat = expected
    ? ids.find((id) => id === expected)
    : ids.length === 1
      ? ids[0]
      : null;
  return chat
    ? { ok: true, chat, updates }
    : { ok: false, code: 'outcome-unknown' };
};
