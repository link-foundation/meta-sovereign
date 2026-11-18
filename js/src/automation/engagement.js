// Whole negative replies to the pinned previous-acquaintance question.
// Input is bounded before normalization and the grammar has no open gaps.
export const negativeAcquaintanceReply = (body) => {
  if (typeof body !== 'string' || body.length > 256) {
    return false;
  }
  const words = (
    body
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).join(' ');
  return /^(?:(?:да )?(?:вроде(?: бы)?|думаю|по моему) )?(?:нет|неа|не|вряд ли)(?: (?:переписки|вроде|помню|припомню|думаю|знаю|наверно|наверное|(?:мы )?не общались))?$/u.test(
    words
  );
};

export const engagementSteps = (draft) =>
  draft.engagement
    ? [
        { text: '', sticker: { id: draft.engagement.sticker } },
        { text: draft.text },
      ]
    : null;
