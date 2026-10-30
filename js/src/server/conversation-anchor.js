import {
  conversationContext,
  conversationSuggestions,
} from '../crm/conversation-context.js';
import { learnConversation } from '../crm/person-learn.js';

const messageId = (key, replyTo) => {
  const [source, ...parts] = key.split(':');
  const id = String(replyTo);
  return id.startsWith('msg:')
    ? id
    : `msg:${source}:${id.includes(':') ? id : `${parts.join(':')}:${id}`}`;
};

// One remembered outside-window anchor per bounded conversation cache entry.
export const anchoredSuggestions = async (
  data,
  key,
  options,
  index,
  project
) => {
  const replyTo = options.replyTo;
  const anchor = conversationContext(data.messages, data.learned, replyTo);
  if (!replyTo || anchor.anchorId) {
    return conversationSuggestions(data.messages, {
      ...options,
      learned: data.learned,
    });
  }
  const id = messageId(key, replyTo);
  if (!id.startsWith(`msg:${key}:`)) {
    return { suggestions: [], context: null };
  }
  const mark = `${id}:${options.locale ?? 'en'}`;
  if (data.anchor?.mark !== mark) {
    const page = await index.page(key, { around: id, limit: 80, project });
    let bytes = 0;
    const older = page.messages.map(project).filter((message) => {
      bytes += (message.body?.length ?? 0) * 2 + 512;
      return bytes <= 2 * 1024 ** 2;
    });
    const messages = [
      ...new Map(
        [...older, ...data.messages].map((message) => [message.id, message])
      ).values(),
    ];
    const learned = learnConversation(messages, options.settings);
    const result = conversationSuggestions(messages, {
      ...options,
      typed: '',
      learned,
    });
    data.anchor = { mark, result };
  }
  const result = data.anchor.result;
  return {
    ...result,
    suggestions: result.suggestions
      .filter(
        (item) =>
          !options.typed?.trim() ||
          item.text
            .toLocaleLowerCase()
            .startsWith(options.typed.trim().toLocaleLowerCase())
      )
      .slice(0, options.limit ?? 8),
  };
};
