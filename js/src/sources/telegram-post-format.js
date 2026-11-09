import { visitHtml } from '../markup/parse.js';
import { codedError } from './http.js';
import { parseFormatted } from './telegram-format.js';

const tags = {
  b: 'bold',
  strong: 'bold',
  i: 'italic',
  em: 'italic',
  u: 'underline',
  ins: 'underline',
  s: 'strike',
  strike: 'strike',
  del: 'strike',
  'tg-spoiler': 'spoiler',
  code: 'code',
  pre: 'pre',
  a: 'link',
  blockquote: 'blockquote',
  'tg-emoji': 'customEmoji',
};
const invalidHtml = () =>
  codedError('Invalid or unsupported Telegram HTML', 'bad-draft');

const entityFields = (type, attrs) => {
  if (type === 'link') {
    if (!/^(?:https?:\/\/|tg:\/\/|mailto:)[^\s]+$/i.test(attrs.href ?? '')) {
      throw invalidHtml();
    }
    return { url: attrs.href };
  }
  if (type === 'customEmoji') {
    if (!/^[1-9]\d{0,19}$/.test(attrs['emoji-id'] ?? '')) {
      throw invalidHtml();
    }
    return { documentId: attrs['emoji-id'] };
  }
  if (type === 'pre') {
    return { language: '' };
  }
  return type === 'blockquote' && Object.hasOwn(attrs, 'expandable')
    ? { collapsed: true }
    : {};
};

const entityOf = (name, attrs, stack, offset) => {
  const type =
    name === 'span' && attrs.class === 'tg-spoiler'
      ? 'spoiler'
      : Object.hasOwn(tags, name)
        ? tags[name]
        : null;
  if (!type) {
    throw invalidHtml();
  }
  const parent = stack.at(-1);
  if (name === 'code' && parent?.entity?.type === 'pre') {
    parent.entity.language = (attrs.class ?? '').replace(/^language-/, '');
    return null;
  }
  if (stack.some((item) => ['code', 'pre'].includes(item.entity?.type))) {
    throw invalidHtml();
  }
  if (
    ['link', 'blockquote', 'customEmoji'].includes(type) &&
    stack.some((item) => item.entity?.type === type)
  ) {
    throw invalidHtml();
  }
  return { type, offset, length: 0, ...entityFields(type, attrs) };
};

// Explicit publication modes keep literal plaintext literal. The composer's
// existing Telegram markdown remains the default when no mode is selected.
export const telegramPostFormat = (input, format) => {
  const text = String(input ?? '');
  if (format === undefined) {
    return parseFormatted(text);
  }
  if (format === 'plain') {
    return { text, entities: [] };
  }
  if (format !== 'html') {
    throw codedError(
      'Telegram publication format must be plain or html',
      'bad-draft'
    );
  }
  const out = { text: '', entities: [] };
  const stack = [];
  visitHtml(
    text,
    {
      onopentag(name, attrs) {
        if (stack.length >= 64) {
          throw invalidHtml();
        }
        stack.push({
          name,
          entity: entityOf(name, attrs, stack, out.text.length),
        });
      },
      ontext(chunk) {
        out.text += chunk;
      },
      onclosetag(name, implied) {
        const entry = stack.pop();
        if (!entry || entry.name !== name || implied) {
          throw invalidHtml();
        }
        if (entry.entity && out.text.length > entry.entity.offset) {
          entry.entity.length = out.text.length - entry.entity.offset;
          out.entities.push(entry.entity);
        }
      },
      oncomment() {
        throw invalidHtml();
      },
      onprocessinginstruction() {
        throw invalidHtml();
      },
    },
    { xmlMode: true, decodeEntities: true, lowerCaseTags: true }
  );
  if (stack.length) {
    throw invalidHtml();
  }
  out.entities.sort((a, b) => a.offset - b.offset || b.length - a.length);
  return out;
};
