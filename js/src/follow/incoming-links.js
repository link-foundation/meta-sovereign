import { extractTelegramLinks, messageLinkFields } from './telegram-links.js';
import { backlinkUrl } from './backlink-shape.js';

const vkCandidates = /https:\/\/vk\.me\/join\/[a-z\d_-]{8,256}/giu;
export const extractFollowInvites = (fields, source) => {
  const values = [];
  let limited = false;
  for (const field of fields) {
    if (values.length >= 128) {
      limited = true;
      break;
    }
    values.push(field);
  }
  if (source === 'telegram') {
    const result = extractTelegramLinks(values);
    return {
      links: result.links.filter((link) =>
        ['public', 'invite'].includes(link.kind)
      ),
      limited: limited || result.limited,
    };
  }
  const links = new Map();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const text = value.slice(0, 65536);
    limited ||= value.length !== text.length;
    for (const match of text.matchAll(vkCandidates)) {
      if (links.size >= 128) {
        limited = true;
        break;
      }
      // Do not turn a credentialed URL, longer hash or path into an invite.
      const before = text[match.index - 1] ?? '';
      const after = text[match.index + match[0].length] ?? '';
      if (
        /[\p{L}\p{N}_@./:-]/u.test(before) ||
        /[\p{L}\p{N}_/?#%-]/u.test(after)
      ) {
        continue;
      }
      const target = backlinkUrl(match[0]);
      links.set(target.url, { ...target, kind: 'invite' });
    }
  }
  return { links: [...links.values()], limited };
};

export const incomingFollowLinks = (
  messages,
  { source, targetSource, maxLinks }
) => {
  const links = new Map();
  let limited = false;
  for (const raw of messages) {
    const incoming =
      source === 'vk' ? raw.out === 0 : !raw.out && raw.className === 'Message';
    if (!incoming || raw.action) {
      continue;
    }
    const found = extractFollowInvites(
      messageLinkFields({ raw }),
      targetSource
    );
    limited ||= found.limited;
    for (const target of found.links) {
      if (!links.has(target.url) && links.size >= maxLinks) {
        limited = true;
        continue;
      }
      if (!links.has(target.url)) {
        links.set(target.url, { url: target.url, messageId: String(raw.id) });
      }
    }
  }
  return { links: [...links.values()], limited, scanned: messages.length };
};
