const keyFor = (review) =>
  `metaSovereign.browserAnswerText.${review.target.source}:${review.chat}`;
const boundedText = (text) => typeof text === 'string' && text.length <= 12000;

const savedDraft = (review, storage) => {
  try {
    const raw = storage?.getItem(keyFor(review));
    const saved =
      typeof raw === 'string' && raw.length <= 80000 ? JSON.parse(raw) : null;
    if (saved?.id === review.id && boundedText(saved.text)) {
      return saved.text;
    }
  } catch {
    // Unavailable or malformed browser storage must not discard the server review.
  }
  return null;
};

/** One local draft per conversation, bound to the exact inspected review. */
export const browserTextDraft = (review, storage) => {
  const submitted = review.outbox?.answerType === 'text';
  if (submitted && ['sending', 'sent', 'unknown'].includes(review.status)) {
    return boundedText(review.outbox.text) ? review.outbox.text : '';
  }
  const saved = savedDraft(review, storage);
  if (saved !== null) {
    return saved;
  }
  if (submitted) {
    return boundedText(review.outbox.text) ? review.outbox.text : '';
  }
  const planned = review.plan?.text;
  return review.plan?.complete && boundedText(planned) ? planned : '';
};

export const saveBrowserTextDraft = (review, text, storage) => {
  if (!boundedText(text)) {
    return;
  }
  try {
    storage?.setItem(keyFor(review), JSON.stringify({ id: review.id, text }));
  } catch {
    // Keep the current editable draft if local persistence is unavailable.
  }
};
