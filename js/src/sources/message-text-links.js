import { messageLinkProperties } from '../message-link-targets.js';
import { metaMessageTargets } from './meta-message-links.js';
import { vkMessageTargets } from './vk-message-links.js';
import { whatsappMessageTargets } from './whatsapp-message-fields.js';

const invalid = () => {
  throw Object.assign(new Error('Message link metadata is unverified.'), {
    code: 'question-links-invalid',
  });
};
const bounded = (entries) => {
  if (!Array.isArray(entries) || entries.length > 128) {
    invalid();
  }
  return entries;
};
const target = (value) => {
  messageLinkProperties([value]);
  try {
    // Validate without normalizing away case, query bytes or fragments.
    new URL(value);
  } catch {
    invalid();
  }
  return value;
};
const splitSurrogate = (text, at) =>
  at > 0 &&
  at < text.length &&
  /[\uD800-\uDBFF]/u.test(text[at - 1]) &&
  /[\uDC00-\uDFFF]/u.test(text[at]);

const entityRange = ({ offset, length }, body) => {
  const end = offset + length;
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 1 ||
    end > body.length ||
    splitSurrogate(body, offset) ||
    splitSurrogate(body, end)
  ) {
    invalid();
  }
  return { offset, end };
};

const entityLinks = (entities, text, body) => {
  if (typeof body !== 'string' || body.length > 6000 || text !== body) {
    invalid();
  }
  const links = [];
  for (const entity of bounded(entities)) {
    if (!entity || typeof entity !== 'object') {
      invalid();
    }
    const type = entity.type ?? entity.className;
    const hidden = ['text_link', 'MessageEntityTextUrl'].includes(type);
    const visible = ['url', 'MessageEntityUrl'].includes(type);
    if (!hidden && !visible) {
      if (entity.url !== undefined) {
        invalid();
      }
      continue;
    }
    const { offset, end } = entityRange(entity, body);
    links.push({
      offset,
      end,
      url: hidden ? target(entity.url) : body.slice(offset, end),
    });
  }
  links.sort((a, b) => a.offset - b.offset);
  if (links.some((link, i) => i > 0 && link.offset < links[i - 1].end)) {
    invalid();
  }
  return links.map((link) => link.url);
};

const segmentLinks = (segments, body) => {
  if (typeof body !== 'string' || body.length > 6000) {
    invalid();
  }
  let text = '';
  const links = [];
  for (const segment of bounded(segments)) {
    const part = typeof segment === 'string' ? segment : segment?.text;
    if (typeof part !== 'string' || text.length + part.length > 6000) {
      invalid();
    }
    text += part;
    if (segment?.type === 'text_link') {
      links.push(target(segment.href));
    } else if (segment?.href !== undefined) {
      invalid();
    } else if (segment?.type === 'link') {
      links.push(part);
    }
  }
  if (text !== body) {
    invalid();
  }
  return links;
};

const archiveLinks = (raw, body) => {
  const segments = Array.isArray(raw.text) ? raw.text : raw.text_entities;
  if (segments === undefined) {
    return undefined;
  }
  const links = segmentLinks(segments, body);
  if (
    Array.isArray(raw.text) &&
    raw.text_entities !== undefined &&
    JSON.stringify(segmentLinks(raw.text_entities, body)) !==
      JSON.stringify(links)
  ) {
    invalid();
  }
  return links;
};

/** Telegram API offsets are UTF-16; Desktop exports carry rich text segments. */
const telegramLinks = (raw, body) => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const text = raw.message ?? raw.text ?? raw.caption;
  const entities =
    raw.message !== undefined || raw.text !== undefined
      ? raw.entities
      : raw.caption_entities;
  return entities === undefined
    ? archiveLinks(raw, body)
    : entityLinks(entities, text, body);
};

const emailNodeTarget = (node) => {
  if (node.linkUnverified || (node.href !== undefined && node.t !== 'a')) {
    invalid();
  }
  return node.t === 'a' && node.href !== null && node.href !== undefined
    ? target(node.href)
    : undefined;
};

/** Existing sanitized mail trees retain destinations independently of plain text. */
const emailLinks = (tree) => {
  if (tree === undefined || tree === null) {
    return undefined;
  }
  const pending = [{ node: { c: tree }, depth: -1 }];
  const links = [];
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop();
    if (!node || typeof node !== 'object' || depth > 40 || ++count > 6001) {
      invalid();
    }
    const href = emailNodeTarget(node);
    if (href !== undefined) {
      links.push(href);
    }
    if (node.c !== undefined) {
      if (!Array.isArray(node.c) || pending.length + node.c.length > 6000) {
        invalid();
      }
      for (let i = node.c.length - 1; i >= 0; i--) {
        pending.push({ node: node.c[i], depth: depth + 1 });
      }
    }
  }
  return links;
};

const sourceLinks = (message) => {
  if (message.source === 'telegram') {
    return telegramLinks(message.raw, message.body);
  }
  if (message.source === 'vk') {
    return vkMessageTargets(message)?.map(target);
  }
  if (message.source === 'facebook' || message.source === 'instagram') {
    return metaMessageTargets(message);
  }
  if (message.source === 'whatsapp') {
    return whatsappMessageTargets(message);
  }
  return message.source === 'email' ? emailLinks(message.bodyTree) : undefined;
};

/** Preserve malformed metadata as a refusal, without retaining a large raw record. */
export const sourceMessageLinkProperties = (message) => {
  try {
    const stored = messageLinkProperties(message.links);
    const links = sourceLinks(message);
    if (links === undefined) {
      return stored;
    }
    const observed = messageLinkProperties(links);
    if (
      message.links !== undefined &&
      JSON.stringify(stored) !== JSON.stringify(observed)
    ) {
      invalid();
    }
    return observed;
  } catch (error) {
    if (error.code !== 'question-links-invalid') {
      throw error;
    }
    return { links: null };
  }
};
