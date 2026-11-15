// Retain only positive API message IDs, never raw provider response objects.
export const vkSequenceReceipt = (result, draft) => {
  const id = result?.result;
  return draft.sequence &&
    draft.source === 'vk' &&
    result?.via === 'api' &&
    Number.isSafeInteger(id) &&
    id > 0
    ? {
        id: `msg:vk:${id}`,
        source: 'vk',
        chat: String(draft.chat),
        text: draft.text ?? '',
        sticker: draft.sticker?.id ?? null,
      }
    : null;
};

export const matchesVkSequenceReceipt = (message, receipt) =>
  Boolean(
    receipt &&
    message.id === receipt.id &&
    message.source === receipt.source &&
    String(message.chat) === receipt.chat &&
    (message.outgoing || message.out || message.sender === 'me') &&
    !message.deleted &&
    !message.service &&
    (message.body ?? '') === receipt.text &&
    (message.sticker?.id ?? null) === receipt.sticker
  );
