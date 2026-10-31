// Read only the birthday contacts' messages from today, never the whole archive.
// A queued draft, a generic greeting or someone else's wishes cannot dismiss one.
const BIRTHDAY_WORDS =
  /\bhappy\s+(?:\d+(?:st|nd|rd|th)\s+)?birthday\b|\bmany happy returns\b|(?:с\s+(?:дн[её]м\s+рождени[яь]|днюхой|др))(?:\s|[!.,🙂🥳🎂]|$)|生日(?:快乐|快樂)|जन्मदिन.*(?:बधाई|मुबारक|शुभकामन)|chúc\s+mừng\s+sinh\s+nhật/iu;
const CONGRATS_ONLY =
  /^(?:поздравляю(?:\s+(?:тебя|вас))?|congratulations|congrats)[\s\p{P}\p{S}\uFE0F]*$/iu;
const SENT = new Set([undefined, null, '', 'sent', 'delivered', 'read']);

const ownSentMessage = (message) => {
  const own =
    message.sender === 'me' ||
    message.outgoing === true ||
    message.raw?.out === true;
  const forwarded =
    message.raw?.fwdFrom || message.forward || message.forwardedFrom;
  return (
    own && !forwarded && SENT.has(message.status) && SENT.has(message.delivery)
  );
};

export const birthdayGreeting = (message) => {
  if (
    !message?.id?.startsWith('msg:') ||
    message.deleted ||
    message.service ||
    message.pending ||
    !ownSentMessage(message)
  ) {
    return false;
  }
  const text = String(message.body ?? message.text ?? '').normalize('NFKC');
  return (
    BIRTHDAY_WORDS.test(text) ||
    CONGRATS_ONLY.test(text) ||
    /🎂/u.test(message.sticker?.emoji ?? '') ||
    /^\s*🎂[\s\p{P}\p{S}\uFE0F]*$/u.test(text)
  );
};

export const birthdayDay = (now = new Date()) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
};

export const greetedToday = (message, day) => {
  const at = Date.parse(message?.timestamp ?? '');
  return at >= day.start && at < day.end && birthdayGreeting(message);
};

/** Recompute dates in the viewer's calendar, including month/year boundaries. */
export const reminderBirthdays = (list, tomorrow = false, now = new Date()) => {
  const dates = [
    now,
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  ];
  return list
    .flatMap((one) => {
      const days = dates.findIndex(
        (date) =>
          date.getDate() === one.day && date.getMonth() + 1 === one.month
      );
      return days === 0 || (tomorrow && days === 1) ? [{ ...one, days }] : [];
    })
    .sort((a, b) => a.days - b.days);
};

/** Page backwards only through this contact's current day; one read at a time. */
export const readBirthdayGreeting = async (
  api,
  chat,
  day,
  cancelled = () => false
) => {
  if (typeof api?.chatPage !== 'function') {
    return false;
  }
  let before = null;
  while (!cancelled()) {
    const page = await api.chatPage({
      key: `telegram:${chat}`,
      before,
      limit: 200,
    });
    if (!Array.isArray(page?.messages)) {
      throw new Error('Birthday greeting history unavailable');
    }
    if (
      page.messages.some(
        (message) =>
          message.source === 'telegram' &&
          String(message.chat) === String(chat) &&
          greetedToday(message, day)
      )
    ) {
      return true;
    }
    const first = page.messages[0];
    if (
      !page.more ||
      !first ||
      !Number.isFinite(Date.parse(first.timestamp)) ||
      Date.parse(first.timestamp) < day.start ||
      first.id === before
    ) {
      return false;
    }
    before = first.id;
  }
  return false;
};
