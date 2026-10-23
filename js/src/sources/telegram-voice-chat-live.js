// A chat's voice chat or live stream, kept live (R-Y188; learned, never
// copied): one link per chat, `groupcall:telegram:<chat>`, written from
// updateGroupCall (the call began, changed or ended) and bumped by
// updateGroupCallParticipants (`rev` grows, so the open panel asks for
// the participants again). An update that names no chat is matched to
// the link that holds the call's id.

const SOURCE = 'telegram';

export const groupCallLinkId = (chat) => `groupcall:${SOURCE}:${chat}`;

const holder = async (store, effect) => {
  if (effect.chat) {
    return store.get(groupCallLinkId(effect.chat));
  }
  const found = await store.query(
    (l) => l?.kind === 'group-call' && l.callId === effect.id
  );
  return found[0] ?? null;
};

export const groupCallWriter = async (store, now, effect) => {
  const before = await holder(store, effect);
  const chat = effect.chat ?? before?.chat;
  const people = effect.kind === 'group-call-people';
  if (!chat || (people && !before)) {
    return false;
  }
  const call = people ? (before.call ?? null) : effect.call;
  await store.put({
    id: groupCallLinkId(chat),
    tokens: ['groupcall', SOURCE, String(chat)],
    kind: 'group-call',
    source: SOURCE,
    chat: String(chat),
    callId: call?.id ?? effect.id,
    call,
    rev: (Number(before?.rev) || 0) + (people ? 1 : 0),
    at: new Date(now()).toISOString(),
  });
  return false;
};
