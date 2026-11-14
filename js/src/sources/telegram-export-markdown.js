// Synchronized, bounded Markdown/JSON parts. One complete structured message
// is stored per JSON line; oversized Markdown messages continue with the same
// source peer/ID and a fragment marker. No history-sized array is retained.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const inline = (value) =>
  String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\`*_{}[\]<>#!|]/g, '\\$&');
const textOf = (msg) =>
  Array.isArray(msg.text)
    ? msg.text
        .map((part) => (typeof part === 'string' ? part : part.text))
        .join('')
    : String(msg.text ?? '');
const mediaLine = (msg) => {
  const file = msg.photo ?? msg.file;
  if (typeof file !== 'string' || !file) {
    return [];
  }
  return file.startsWith('(')
    ? [file]
    : [
        `[${inline(msg.file_name ?? msg.media_type ?? 'Media')}](${file
          .split('/')
          .map((part) =>
            encodeURIComponent(part).replace(/[()]/g, (c) =>
              c === '(' ? '%28' : '%29'
            )
          )
          .join('/')})`,
      ];
};
const linesOf = (msg) => [
  `**${inline(msg.from ?? msg.actor ?? msg.from_id ?? msg.actor_id ?? 'Unknown')}** [${inline(msg.date).replace('T', ' ')}] · ${inline(msg.source_chat)} / ${msg.id}`,
  ...(msg.type === 'service'
    ? [inline(msg.action), ...(msg.members ?? []).map(inline)]
    : textOf(msg)
        .split(/\r\n|\r|\n/)
        .map(inline)),
  ...mediaLine(msg),
  '',
];

export const createMarkdownWriter = async ({
  folder,
  meta,
  maxLines = 1500,
}) => {
  let index = 1;
  let lines = [];
  let messages = [];
  let closed = false;
  // Header/navigation/final newline and structured wrapper reserve eight lines.
  const capacity = maxLines - 8;
  const flush = async (next) => {
    const previous = index > 1 ? `history-${index - 1}.md` : null;
    const following = next ? `history-${index + 1}.md` : null;
    const navigation = [
      previous && `[Previous](${previous})`,
      `Part ${index}`,
      following && `[Next](${following})`,
      `[Structured data](history-${index}.json)`,
    ]
      .filter(Boolean)
      .join(' · ');
    const markdown = [
      `# ${inline(meta.name)}`,
      '',
      navigation,
      '',
      ...lines,
    ].join('\n');
    const header = {
      ...meta,
      part: index,
      previousPart: previous?.replace('.md', '.json') ?? null,
      nextPart: following?.replace('.md', '.json') ?? null,
    };
    const json = `{"metadata":${JSON.stringify(header)},\n"messages":[\n${messages.map((m) => JSON.stringify(m)).join(',\n')}\n]}\n`;
    await fs.writeFile(path.join(folder, `history-${index}.md`), markdown);
    await fs.writeFile(path.join(folder, `history-${index}.json`), json);
    index += 1;
    lines = [];
    messages = [];
  };
  return {
    add: async (msg) => {
      if (closed) {
        throw new Error('Export writer is closed');
      }
      const content = linesOf(msg);
      if (
        lines.length &&
        content.length <= capacity &&
        lines.length + content.length > capacity
      ) {
        await flush(true);
      }
      let offset = 0;
      let fragment = 0;
      let originalPart = index;
      while (offset < content.length) {
        if (lines.length >= capacity || messages.length >= capacity) {
          await flush(true);
        }
        if (fragment > 0) {
          lines.push(
            `**${inline(msg.source_chat)} / ${msg.id} continued** · [Original](history-${originalPart}.md)`,
            ''
          );
        } else {
          originalPart = index;
        }
        const amount = Math.min(
          capacity - lines.length,
          content.length - offset
        );
        lines.push(...content.slice(offset, offset + amount));
        // A continued message keeps its complete structured original exactly
        // once. Later fragments reference that record rather than duplicating it.
        messages.push(
          fragment === 0
            ? msg
            : {
                id: msg.id,
                source_chat: msg.source_chat,
                continuation: fragment,
                originalPart: `history-${originalPart}.json`,
              }
        );
        offset += amount;
        fragment += 1;
      }
    },
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await flush(false);
    },
  };
};
