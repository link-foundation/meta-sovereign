// Recover only facts retained in a raw HH message. Earlier parsers discarded
// this payload; those records stay readable and require an explicit re-import.
import { hhMessageMetadata } from '../../sources/hh-messages.js';

export const id = '0010-hh-message-metadata';
export const from = 9;
export const to = 10;
export const description =
  'Recover HH author direction, application barriers, replies and edits from saved payloads.';

export const up = async (ctx) => {
  await ctx.scan({ prefix: 'msg:hh:' }, async (batch) => {
    const out = [];
    for (const link of batch) {
      if (link.source !== 'hh' || !link.raw || typeof link.raw !== 'object') {
        continue;
      }
      const metadata = hhMessageMetadata(link.raw);
      const patch = Object.fromEntries(
        Object.entries(metadata).filter(([key]) =>
          key === 'sender'
            ? !link.sender || link.sender === 'unknown'
            : link[key] === null || link[key] === undefined
        )
      );
      const children = link.children?.map((child) =>
        patch.sender && child.startsWith('sender:hh:')
          ? `sender:hh:${patch.sender}`
          : child
      );
      if (patch.replyTo && children) {
        const reply = `replyto:hh:${patch.replyTo}`;
        if (!children.includes(reply)) {
          children.push(reply);
        }
      }
      out.push({ ...link, ...patch, ...(children ? { children } : {}) });
    }
    await ctx.putMany(out);
  });
};
