// Normal Telegram clients ignore tg://user?id (a Bot API abstraction).
// Use documented username/phone/message links; numeric-only peers use Web A's
// signed-in chat route instead of launching a native app without a destination.
// References: core.telegram.org/api/links; Ajaxy/telegram-tt src/util/routing.ts.
export const telegramChatUrl = ({
  source,
  chat,
  username,
  phone,
  lastId,
  text,
} = {}) => {
  if (source !== 'telegram' || !/^-?[1-9]\d*$/.test(String(chat))) {
    return null;
  }
  const handle = String(username ?? '').replace(/^@/, '');
  const number = String(phone ?? '').replace(/[\s()+-]/g, '');
  const native = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(handle)
    ? `https://t.me/${handle}`
    : /^[1-9]\d{6,14}$/.test(number)
      ? `https://t.me/+${number}`
      : null;
  if (native) {
    return text ? `${native}?text=${encodeURIComponent(text)}` : native;
  }
  const id = String(chat);
  if (/^-100\d+$/.test(id) && /^[1-9]\d*$/.test(String(lastId))) {
    return `https://t.me/c/${id.slice(4)}/${lastId}`;
  }
  return `https://web.telegram.org/a/#${id}`;
};

export const isTelegramWebUrl = (url) =>
  String(url ?? '').startsWith('https://web.telegram.org/a/#');
