/**
 * VK's own "Request your data" archive (R-Z8): `messages/<peer>/messages<N>.html`
 * pages, 50 messages each. VK ships them as Windows-1251 HTML. The page of
 * one chat looks like
 *
 *   <div class="message" data-id="123">
 *     <div class="message__header"><a href="https://vk.com/id7">Ann Lee</a>, 5 янв 2021 в 12:02:33 (ред.)</div>
 *     <div>text<div class="kludges"><div class="attachment">
 *       <div class="attachment__description">Фотография</div>
 *       <a class="attachment__link" href="https://...">Ссылка</a></div></div></div>
 *   </div>
 *
 * This reads such a page into the JSON shape the VK adapter already imports
 * (`{ conversations: [{ peer, chat_settings, messages }] }`), attachments in
 * the shape of VK's API so one mapper serves both. The archive has no time
 * zone; times are read in this machine's time zone, like WhatsApp exports
 * (R-Z9). A sender known only by name keeps the name.
 * The pages are tolerant of both Russian and English archives.
 */

const MONTHS = {
  янв: 0,
  января: 0,
  jan: 0,
  january: 0,
  фев: 1,
  февраля: 1,
  feb: 1,
  february: 1,
  мар: 2,
  марта: 2,
  mar: 2,
  march: 2,
  апр: 3,
  апреля: 3,
  apr: 3,
  april: 3,
  мая: 4,
  май: 4,
  may: 4,
  июн: 5,
  июня: 5,
  jun: 5,
  june: 5,
  июл: 6,
  июля: 6,
  jul: 6,
  july: 6,
  авг: 7,
  августа: 7,
  aug: 7,
  august: 7,
  сен: 8,
  сентября: 8,
  sep: 8,
  sept: 8,
  september: 8,
  окт: 9,
  октября: 9,
  oct: 9,
  october: 9,
  ноя: 10,
  ноября: 10,
  nov: 10,
  november: 10,
  дек: 11,
  декабря: 11,
  dec: 11,
  december: 11,
};

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code =
        name[1].toLowerCase() === 'x'
          ? Number.parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

const textOf = (html) =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/[ \t]+\n/g, '\n')
  ).trim();

/** HTML bytes to text: Windows-1251 as VK ships it, else UTF-8. */
export const decodeVkHtml = (bytes) => {
  if (typeof bytes === 'string') {
    return bytes;
  }
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const label = /charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
};

/** Whether text/bytes look like a VK archive page rather than JSON. */
export const looksLikeVkHtml = (archive) => {
  if (archive instanceof Uint8Array) {
    return true;
  }
  return typeof archive === 'string' && /^\s*</.test(archive);
};

const DATE_RE =
  /(\d{1,2})\s+([A-Za-zА-Яа-яё]+)\.?\s+(\d{4})\s*(?:в|at|,)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/;

/** "5 янв 2021 в 12:02:33" to unix seconds in THIS machine's time zone, or null. */
export const parseVkArchiveDate = (text) => {
  const m = DATE_RE.exec(text);
  const month = m ? MONTHS[m[2].toLowerCase()] : undefined;
  if (month === undefined) {
    return null;
  }
  const [, day, , year, hour, minute, second = '0'] = m;
  return (
    new Date(
      Number(year),
      month,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ).getTime() / 1000
  );
};

// The VK id behind a profile link: id7 -> 7, club9 / public9 -> -9.
const idFromHref = (href) => {
  const m = /vk\.(?:com|ru)\/(id|club|public)(\d+)/.exec(href ?? '');
  if (!m) {
    return null;
  }
  return m[1] === 'id' ? Number(m[2]) : -Number(m[2]);
};

const ATTACHMENTS = [
  [
    /^(фотограф|photo)/i,
    (url) => ({
      type: 'photo',
      photo: { sizes: [{ url, width: 0, height: 0 }] },
    }),
  ],
  [
    /^(голосов|voice|audio message)/i,
    (url) => ({ type: 'audio_message', audio_message: { link_ogg: url } }),
  ],
  [
    /^(стикер|sticker)/i,
    (url) => ({ type: 'sticker', sticker: { images: [{ url, width: 128 }] } }),
  ],
  [/^(ссылк|link)/i, (url) => ({ type: 'link', link: { url, title: url } })],
  [
    /^(документ|document|файл|file)/i,
    (url) => ({
      type: 'doc',
      doc: { url, title: url?.split('/').pop() ?? null },
    }),
  ],
  [
    /^(видео|video)/i,
    (url, d) => ({ type: 'video', video: { title: url ?? d } }),
  ],
];

const attachmentOf = (description, url) => {
  const found = ATTACHMENTS.find(([pattern]) => pattern.test(description));
  return found
    ? found[1](url ?? null, description)
    : { type: description.toLowerCase().slice(0, 40) || 'attachment' };
};

const attachmentsOf = (html) =>
  [
    ...html.matchAll(
      /<div class="attachment__description">([\s\S]*?)<\/div>\s*(?:<a class="attachment__link" href="([^"]*)")?/g
    ),
  ].map((m) => attachmentOf(textOf(m[1]), m[2] ? decodeEntities(m[2]) : null));

const messageOf = (html) => {
  const id = /data-id="(-?\d+)"/.exec(html)?.[1];
  const header = /<div class="message__header">([\s\S]*?)<\/div>/.exec(
    html
  )?.[1];
  if (!header) {
    return null;
  }
  const afterHeader = html.slice(html.indexOf(header) + header.length);
  const kludges = afterHeader.indexOf('<div class="kludges">');
  const bodyHtml = (
    kludges < 0 ? afterHeader : afterHeader.slice(0, kludges)
  ).replace(/^\s*<\/div>/, '');
  const plain = textOf(header);
  const stamp = DATE_RE.exec(plain);
  const name = (stamp ? plain.slice(0, stamp.index) : plain).replace(
    /[,\s]+$/,
    ''
  );
  const fromId = idFromHref(/href="([^"]*)"/.exec(header)?.[1]);
  const date = parseVkArchiveDate(plain);
  const own = /^(вы|you)$/i.test(name);
  const attachments = attachmentsOf(afterHeader);
  return {
    ...(id ? { id: Number(id) } : {}),
    from_id: fromId ?? name,
    from_name: name || null,
    date,
    text: textOf(bodyHtml),
    ...(own ? { out: 1 } : {}),
    ...(/\((ред\.|edited)\)/i.test(plain) && date ? { update_time: date } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
};

// `messages/<peer>/messages0.html`: a number, `c<chat>` or a negative id.
export const peerFromArchivePath = (name) => {
  const m = /messages\/(-?\d+|c\d+)\//.exec(String(name).replaceAll('\\', '/'));
  if (!m) {
    return null;
  }
  return m[1].startsWith('c')
    ? 2000000000 + Number(m[1].slice(1))
    : Number(m[1]);
};

/**
 * One archive page to `{ conversations: [...] }`. `peer` is the dialog's
 * id (from the folder name); the chat's title is the page header's link text.
 */
export const parseVkHtmlPage = (html, { peer = null } = {}) => {
  const parts = html.split(/<div class="message"[^>]*?(?=\sdata-id)/).slice(1);
  const chunks = parts.length > 0 ? parts : [];
  const messages = chunks
    .map((chunk) => messageOf(chunk))
    .filter((msg) => msg && (msg.text || msg.attachments));
  const title = textOf(
    /<div class="page_block_header[^"]*">([\s\S]*?)<\/div>/.exec(html)?.[1] ??
      ''
  );
  return {
    conversations: [
      {
        peer: { id: peer ?? messages[0]?.from_id ?? 'unknown' },
        ...(title ? { chat_settings: { title } } : {}),
        messages,
      },
    ],
  };
};
