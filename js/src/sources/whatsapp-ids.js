/**
 * Stable WhatsApp chat ids (R-Z9).
 *
 * A chat keeps the same id between pulls and imports:
 *   - a person: the phone number in E.164, `+491701234567` (from the
 *     `<digits>@c.us` / `@s.whatsapp.net` JID, or a typed number);
 *   - a group: its JID, `<digits>-<digits>@g.us` (or `<digits>@g.us`);
 *   - a linked-id contact (`<digits>@lid`): the JID as it is;
 *   - ONLY for an archive whose chat is a saved contact name (an export
 *     file carries no number): `name:<hash of the normalised name>`.
 *     That id cannot match the Web id of the same person, because the
 *     file has no number; it is stable between re-imports of the same
 *     chat name and nothing more.
 */

const PERSON_JID = /^(\d{5,20})(?::\d+)?@(?:c\.us|s\.whatsapp\.net)$/;
const GROUP_JID = /^(\d{5,20}(?:-\d{5,20})?)@g\.us$/;
const LID_JID = /^(\d{5,30})@lid$/;
const PHONE = /^\+?[\d\s().-]{6,24}$/;

/** A small stable string hash (FNV-style, base 36). */
export const stableHash = (text) => {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 + code, 2246822519) >>> 0;
  }
  return (h1 * 1048576 + (h2 >>> 12)).toString(36);
};

/** The E.164 form of a typed or JID phone number, or null. */
export const toE164 = (value) => {
  const text = String(value ?? '').trim();
  const jid = PERSON_JID.exec(text);
  if (jid) {
    return `+${jid[1]}`;
  }
  if (!PHONE.test(text)) {
    return null;
  }
  const digits = text.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15 ? `+${digits}` : null;
};

/** `{kind, id}` of a JID or phone: kind is person, group or lid. */
export const parseChatRef = (value) => {
  const text = String(value ?? '').trim();
  const group = GROUP_JID.exec(text);
  if (group) {
    return { kind: 'group', id: `${group[1]}@g.us` };
  }
  const lid = LID_JID.exec(text);
  if (lid) {
    return { kind: 'lid', id: `${lid[1]}@lid` };
  }
  const phone = toE164(text);
  return phone ? { kind: 'person', id: phone } : null;
};

/** The chat id for a JID or phone; null when it names none. */
export const chatIdOf = (value) => parseChatRef(value)?.id ?? null;

/** Archive chat id for an exported chat name (a number, else a hash). */
export const archiveChatId = (name) => {
  const text = String(name ?? '').trim();
  const phone = toE164(text);
  if (phone) {
    return phone;
  }
  const folded = text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
  return `name:${stableHash(folded || 'unknown')}`;
};

/**
 * The chat name in an export's file name: "WhatsApp Chat with Anna.txt",
 * "WhatsApp Chat - Anna.zip"; `_chat.txt` has none.
 */
export const chatNameFromFile = (fileName) => {
  const base = String(fileName ?? '')
    .split(/[\\/]/)
    .pop()
    .replace(/\.(txt|zip)$/i, '')
    .trim();
  if (!base || /^_chat$/i.test(base)) {
    return null;
  }
  const prefix = /^whatsapp[\s_-]*chat/i.exec(base);
  const rest = prefix ? base.slice(prefix[0].length) : '';
  const separator = /^(?:\s+(?:with|mit|con|avec|com)\b|\s*[-–])/i.exec(rest);
  return (separator ? rest.slice(separator[0].length) : base).trim() || null;
};
