// A completion should save more typing than choosing the option costs.
const MIN_ADDED_LETTERS = 3;

export const wordPredictionAllowed = (typed) =>
  typed === undefined || !/[.!?…]$/u.test(String(typed));

export const usefulSuggestion = (suggestion, typed) => {
  if (suggestion.kind !== 'word') {
    return true;
  }
  const added =
    suggestion.insert ??
    suggestion.word ??
    String(suggestion.text ?? '')
      .trim()
      .split(/\s+/u)
      .at(-1);
  return (
    wordPredictionAllowed(typed) &&
    (String(added ?? '').match(/[\p{L}\p{N}]/gu)?.length ?? 0) >=
      MIN_ADDED_LETTERS
  );
};
