/**
 * The HTML pages of an exported chat (R-Y186; Telegram Desktop's export
 * has `messages.html`, `messages2.html`, … with a small stylesheet; the
 * markup and the style here are our own): up to 1000 messages a page,
 * each page linking to the next, the media shown from relative links.
 * The pages are plain English, as the files are data for the user to
 * keep, not the app's screen.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const PER_PAGE = 1000;

export const EXPORT_CSS = `body{margin:0;background:#fff;color:#222;font:14px/1.45 -apple-system,"Segoe UI",Roboto,sans-serif}
.page_header{background:#527da3;color:#fff;padding:14px 20px;font-size:17px}
.page_body{max-width:640px;margin:0 auto;padding:12px 16px}
.message{padding:4px 0;border-radius:6px}
.message .body{padding:4px 8px}
.message.default.joined .body{padding-top:0}
.message.service{text-align:center;color:#6c7a89}
.from_name{color:#3a6d99;font-weight:600}
.date{float:right;margin-left:12px}
.details,.status{color:#7a8794;font-size:12px}
.reply_to,.forwarded{border-left:3px solid #8fb3d1;padding-left:8px;margin:2px 0}
.text{white-space:normal;word-wrap:break-word}
.photo,.sticker,video{max-width:100%;max-height:420px;border-radius:6px;display:block}
audio{width:100%}
.media_file{display:block;padding:6px 8px;background:#eef3f7;border-radius:6px;margin:3px 0;color:#222;text-decoration:none}
.spoiler{background:#cdd5db;color:transparent;border-radius:3px}
.spoiler:hover{color:inherit;background:none}
blockquote{margin:2px 0;padding-left:8px;border-left:3px solid #8fb3d1}
pre{background:#f1f4f6;padding:6px;border-radius:4px;overflow:auto}
a{color:#2f6fa7}
.pagination{display:block;text-align:center;padding:14px;margin:12px 0}
@media (prefers-color-scheme:dark){body{background:#17212b;color:#e8eef3}.message .body{color:#e8eef3}.media_file{background:#22313f;color:#e8eef3}.from_name,a{color:#7ab6e6}pre{background:#202b36}}
`;

export const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Only web, mail and Telegram links become links.
const safeHref = (url) =>
  /^(https?:\/\/|mailto:|tg:)/i.test(String(url)) ? String(url) : null;

const WRAP = Object.freeze({
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  strikethrough: ['<s>', '</s>'],
  code: ['<code>', '</code>'],
  pre: ['<pre>', '</pre>'],
  spoiler: ['<span class="spoiler">', '</span>'],
  blockquote: ['<blockquote>', '</blockquote>'],
});

const wrapperOf = (entity, text) => {
  if (WRAP[entity.type]) {
    return WRAP[entity.type];
  }
  const url =
    entity.type === 'text_link'
      ? entity.extras?.href
      : entity.type === 'link'
        ? text
        : entity.type === 'email'
          ? `mailto:${text}`
          : null;
  const href = url ? safeHref(url) : null;
  return href ? [`<a href="${esc(href)}">`, '</a>'] : ['', ''];
};

/** A message's text, from `segmentsOf` pieces, as HTML. */
export const textHtml = (segments) =>
  segments
    .map((piece) => {
      const wraps = piece.covers.map((e) => wrapperOf(e, piece.text));
      return (
        wraps.map(([open]) => open).join('') +
        esc(piece.text).replace(/\n/g, '<br>') +
        wraps
          .map(([, close]) => close)
          .reverse()
          .join('')
      );
    })
    .join('');

const SERVICE_WORDS = Object.freeze({
  create_group: 'created group',
  create_channel: 'created channel',
  edit_group_title: 'changed group title to',
  edit_group_photo: 'changed group photo',
  delete_group_photo: 'deleted group photo',
  invite_members: 'invited',
  remove_members: 'removed',
  join_group_by_link: 'joined group by link',
  join_group_by_request: 'joined group by request',
  pin_message: 'pinned a message',
  clear_history: 'cleared the history',
  phone_call: 'made a call',
  topic_created: 'created topic',
});

const serviceText = (msg) => {
  const words =
    SERVICE_WORDS[msg.action] ?? String(msg.action ?? '').replace(/_/g, ' ');
  const extra = [msg.title, ...(msg.members ?? [])].filter(Boolean).join(', ');
  return `${esc(msg.actor ?? '')} ${esc(words)}${extra ? ` ${esc(extra)}` : ''}`;
};

const humanSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) {
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  return n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
};

const note = (text) => `<div class="status details">${esc(text)}</div>`;

const fileHtml = (msg) => {
  const target = msg.file;
  if (target.startsWith('(')) {
    return note(target);
  }
  const src = esc(target);
  switch (msg.media_type) {
    case 'video_file':
    case 'animation':
    case 'video_message':
      return `<video controls src="${src}"></video>`;
    case 'voice_message':
    case 'audio_file':
      return `<audio controls src="${src}"></audio>`;
    case 'sticker':
      return `<img class="sticker" src="${src}" alt="${esc(msg.sticker_emoji ?? '')}">`;
    default:
      return `<a class="media_file block_link" href="${src}">${esc(msg.file_name ?? path.basename(target))}<span class="details"> ${humanSize(msg.file_size)}</span></a>`;
  }
};

const mediaHtml = (msg) => {
  if (msg.photo) {
    return msg.photo.startsWith('(')
      ? note(msg.photo)
      : `<a href="${esc(msg.photo)}"><img class="photo" src="${esc(msg.photo)}" alt=""></a>`;
  }
  if (msg.file) {
    return fileHtml(msg);
  }
  if (msg.location_information) {
    const { latitude, longitude } = msg.location_information;
    return note(`Location: ${latitude}, ${longitude}`);
  }
  if (msg.contact_information) {
    const c = msg.contact_information;
    return note(`Contact: ${c.first_name} ${c.last_name} ${c.phone_number}`);
  }
  return msg.poll ? note(`Poll: ${msg.poll.question}`) : '';
};

const JOIN_WINDOW_S = 300;

const joinsPrevious = (msg, prev) =>
  Boolean(prev) &&
  prev.type === 'message' &&
  msg.type === 'message' &&
  prev.from_id === msg.from_id &&
  !msg.forwarded_from &&
  Number(msg.date_unixtime) - Number(prev.date_unixtime) <= JOIN_WINDOW_S;

/** One message (the JSON entry and its text's pieces) as HTML. */
export const messageHtml = (msg, segments, prev = null) => {
  if (msg.type === 'service') {
    return `<div class="message service" id="message${msg.id}"><div class="body details">${serviceText(msg)}</div></div>\n`;
  }
  const joined = joinsPrevious(msg, prev);
  const reply = msg.reply_to_message_id
    ? `<div class="reply_to details">In reply to <a href="#message${msg.reply_to_message_id}">this message</a></div>`
    : '';
  const forwarded = msg.forwarded_from
    ? `<div class="forwarded details">Forwarded from ${esc(msg.forwarded_from)}</div>`
    : '';
  const text = textHtml(segments);
  return [
    `<div class="message default clearfix${joined ? ' joined' : ''}" id="message${msg.id}"><div class="body">`,
    `<div class="pull_right date details" title="${esc(msg.date)}">${esc(msg.date.slice(11, 16))}</div>`,
    joined ? '' : `<div class="from_name">${esc(msg.from ?? '')}</div>`,
    forwarded,
    reply,
    mediaHtml(msg),
    text ? `<div class="text">${text}</div>` : '',
    '</div></div>\n',
  ].join('');
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const dayHtml = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return `<div class="message service"><div class="body details">${d} ${MONTHS[m - 1]} ${y}</div></div>\n`;
};

export const pageHtml = ({ title, body, next }) =>
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Exported Data</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="css/style.css" rel="stylesheet">
</head>
<body>
<div class="page_wrap">
<div class="page_header"><div class="content"><div class="text bold">${esc(title)}</div></div></div>
<div class="page_body chat_page"><div class="history">
${body}${next ? `<a class="pagination block_link" href="${esc(next)}">Next messages</a>\n` : ''}</div></div>
</div>
</body>
</html>
`;

export const pageName = (n) =>
  n === 1 ? 'messages.html' : `messages${n}.html`;

/**
 * Writes the pages as messages come: `add(msg, segments)`, `close()`.
 * A page is written once the next one begins (it must link to it), the
 * last one on `close`.
 */
export const createHtmlWriter = async ({ dir, title, perPage = PER_PAGE }) => {
  await fs.mkdir(path.join(dir, 'css'), { recursive: true });
  await fs.writeFile(path.join(dir, 'css', 'style.css'), EXPORT_CSS);
  let page = 1;
  let count = 0;
  let parts = [];
  let prev = null;
  let day = null;
  const flush = (next) =>
    fs.writeFile(
      path.join(dir, pageName(page)),
      pageHtml({ title, body: parts.join(''), next })
    );
  return {
    pages: () => (count > 0 ? page : 0),
    add: async (msg, segments) => {
      if (count > 0 && count % perPage === 0) {
        await flush(pageName(page + 1));
        page += 1;
        parts = [];
        prev = null;
        day = null;
      }
      const today = msg.date.slice(0, 10);
      if (today !== day) {
        parts.push(dayHtml(today));
        day = today;
        prev = null;
      }
      parts.push(messageHtml(msg, segments, prev));
      prev = msg;
      count += 1;
    },
    close: async () => {
      if (count === 0) {
        parts = [
          `<div class="message service"><div class="body details">No messages</div></div>\n`,
        ];
      }
      await flush(null);
    },
  };
};
