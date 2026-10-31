// Common function words do not qualify a message for discovery. Normalization
// preserves scripts and inflections; this is an explicit, reversible heuristic.
const STOP = new Set(
  (
    'a an the this that these those i me my mine we our you your he she it they them their ' +
    'and or but if then so as of for from in into on at to by with without not no yes is are was were be been being do does did have has had can could would should will just also very ' +
    'а и или но если то это этот эта эти я мне меня мой моя мы наш ты вы тебя тебе вас вам ваш он она оно они их его её ее ' +
    'в во на по с со к ко от до из за для о об у при без не нет да бы был была было были быть есть же ли ну вот так тут там уже ещё еще как что кто где когда ' +
    '的 了 是 在 和 与 或 我 你 他 她 它 我们 你们 他们 这 那 一个 有 没有 也 就 都 而 但 ' +
    'और या पर में से को का की के यह वह मैं तुम आप हम वे है हैं था थी थे हो एक नहीं भी'
  ).split(/\s+/)
);
const segmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;
export const meaningfulWords = (text) => {
  const normalized = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase();
  const words = [];
  if (segmenter) {
    for (const one of segmenter.segment(normalized)) {
      if (one.isWordLike) {
        words.push(one.segment);
      }
    }
  } else {
    words.push(...(normalized.match(/[\p{L}\p{M}]+/gu) ?? []));
  }
  return words.filter(
    (word) =>
      /\p{L}/u.test(word) &&
      !STOP.has(word) &&
      (word.length >= 2 || /\p{Script=Han}/u.test(word))
  );
};
const wordCounter = (minFrequency) => {
  const frequency = new Map();
  const byMessage = new Map();
  const add = (message) => {
    const words = meaningfulWords(message.body);
    byMessage.set(message.id, words);
    for (const word of words) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  };
  const finish = () => ({
    eligible: new Set(
      [...byMessage]
        .filter(([, words]) =>
          words.some((word) => frequency.get(word) >= minFrequency)
        )
        .map(([id]) => id)
    ),
    words: [...frequency]
      .filter(([, count]) => count >= minFrequency)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 100)
      .map(([word, count]) => ({ word, count })),
  });
  return { add, finish };
};
export const wordEligibility = (messages, minFrequency = 5) => {
  const counter = wordCounter(minFrequency);
  messages.forEach(counter.add);
  return counter.finish();
};
export const wordEligibilityAsync = async (
  messages,
  minFrequency,
  yieldWork
) => {
  const counter = wordCounter(minFrequency);
  for (const message of messages) {
    counter.add(message);
    await yieldWork();
  }
  return counter.finish();
};
