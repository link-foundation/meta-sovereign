// vCard 2.1/3.0/4.0 exports from iCloud, Google, Outlook and address books.
// No network requests or writes: import planning is a separate step.
export const MAX_VCARD_BYTES = 10 * 1024 * 1024;
export const MAX_CONTACTS = 20_000;

const bad = (message) =>
  Object.assign(new Error(message), { code: 'bad-vcard' });

export const decodeVcard = (input) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > MAX_VCARD_BYTES) {
    throw bad('Choose a vCard file no larger than 10 MB.');
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    const raw = new TextDecoder('windows-1252').decode(bytes);
    const charset = raw.match(/;CHARSET="?([\w-]+)/i)?.[1] ?? 'windows-1252';
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      throw bad(`The vCard encoding ${charset} is not supported.`);
    }
  }
};
const unescape = (value) =>
  value.replace(/\\([nN,;\\])/g, (_all, c) => (/[nN]/.test(c) ? '\n' : c));

const splitValue = (value, delimiter) => {
  const parts = [];
  let current = '';
  let escaped = false;
  let quoted = false;
  for (const char of value) {
    if (char === delimiter && !escaped && !quoted) {
      parts.push(current);
      current = '';
      continue;
    }
    if (char === '"' && !escaped) {
      quoted = !quoted;
    }
    current += char;
    escaped = char === '\\' && !escaped;
  }
  parts.push(current);
  return parts;
};

const logicalLines = (text) => {
  const lines = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    const last = lines.length - 1;
    if (
      last >= 0 &&
      /ENCODING=QUOTED-PRINTABLE/i.test(lines[last].split(':')[0]) &&
      lines[last].endsWith('=')
    ) {
      lines[last] = lines[last].slice(0, -1) + line.replace(/^[ \t]/, '');
    } else if (last >= 0 && /^[ \t]/.test(line)) {
      lines[last] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
};

const property = (line) => {
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      quoted = !quoted;
    }
    if (line[i] === ':' && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) {
    throw bad('The file contains an invalid vCard property.');
  }
  const [rawName, ...params] = splitValue(line.slice(0, colon), ';');
  const name = rawName.split('.').pop().toUpperCase();
  let value = line.slice(colon + 1);
  if (params.some((p) => /^ENCODING=QUOTED-PRINTABLE$/i.test(p))) {
    const bytes = [];
    for (let i = 0; i < value.length; i += 1) {
      if (
        value[i] === '=' &&
        /^[0-9a-f]{2}$/i.test(value.slice(i + 1, i + 3))
      ) {
        bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(...new TextEncoder().encode(value[i]));
      }
    }
    const charset =
      params
        .find((p) => /^CHARSET=/i.test(p))
        ?.slice(8)
        .replace(/^"|"$/g, '') ?? 'utf-8';
    try {
      value = new TextDecoder(charset).decode(new Uint8Array(bytes));
    } catch {
      throw bad(`The vCard encoding ${charset} is not supported.`);
    }
  }
  return { name, value };
};

const append = (contact, { name, value }) => {
  const text = unescape(value);
  if (name === 'FN') {
    contact.name = text;
  } else if (name === 'N') {
    const n = splitValue(value, ';').map(unescape);
    contact.structuredName = [n[3], n[1], n[2], n[0], n[4]]
      .filter(Boolean)
      .join(' ');
  } else if (name === 'UID') {
    contact.uid = text;
  } else if (name === 'VERSION') {
    contact.version = text;
  } else if (name === 'TEL') {
    contact.phones.push(text.replace(/^tel:/i, ''));
  } else if (name === 'EMAIL') {
    contact.emails.push(text.replace(/^mailto:/i, ''));
  } else if (name === 'URL') {
    contact.urls.push(text);
  } else if (name === 'ORG') {
    contact.organization = splitValue(value, ';')
      .map(unescape)
      .filter(Boolean)
      .join(' / ');
  } else if (name === 'TITLE') {
    contact.title = text;
  } else if (name === 'NICKNAME') {
    contact.nickname = text;
  } else if (name === 'ADR') {
    const a = splitValue(value, ';').map(unescape);
    contact.addresses.push({
      street: [a[0], a[1], a[2]].filter(Boolean).join('\n'),
      city: a[3],
      region: a[4],
      postalCode: a[5],
      country: a[6],
    });
  }
};

const validateInput = (text) => {
  if (
    typeof text !== 'string' ||
    new TextEncoder().encode(text).length > MAX_VCARD_BYTES
  ) {
    throw bad('Choose a vCard file no larger than 10 MB.');
  }
};

export const parseVcard = (text) => {
  validateInput(text);
  const contacts = [];
  let current = null;
  for (const line of logicalLines(text)) {
    if (!line.trim()) {
      continue;
    }
    if (/^BEGIN:VCARD$/i.test(line)) {
      if (current) {
        throw bad('The file contains an unfinished vCard.');
      }
      current = { phones: [], emails: [], urls: [], addresses: [] };
    } else if (/^END:VCARD$/i.test(line)) {
      if (!current || !['2.1', '3.0', '4.0'].includes(current.version)) {
        throw bad('Choose a vCard 2.1, 3.0 or 4.0 export.');
      }
      current.name ||= current.structuredName ?? '';
      delete current.structuredName;
      contacts.push(current);
      current = null;
      if (contacts.length > MAX_CONTACTS) {
        throw bad('Import at most 20,000 contacts in one file.');
      }
    } else if (current) {
      append(current, property(line));
    } else {
      throw bad('Choose a .vcf contact export.');
    }
  }
  if (current || contacts.length === 0) {
    throw bad('The file contains no complete vCards.');
  }
  return contacts;
};
