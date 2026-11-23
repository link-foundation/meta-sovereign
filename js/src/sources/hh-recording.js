import { importMessageVersions } from '../storage/message-version-id.js';
import { buildMessageLink } from './link.js';
import { normalizeHhMessages } from './hh-messages.js';
import { HH_WEB_UI } from './hh-web-ui.js';

// The native recorder keys the document by conversation ID. Its DOM messages
// have an ID, direction and wording, with no absolute send time or receipt.
const nativeId = (value) =>
  typeof value === 'string' && /^\d{1,30}$/u.test(value);
const text = (value, size) =>
  typeof value === 'string' && value.length <= size ? value : '';
const applicationTitle = new RegExp(
  HH_WEB_UI.messages.serviceTitlePattern,
  'iu'
);
const invalid = () => new Error('Invalid HeadHunter chat-history recording');
const recordedAt = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value))
    ? value
    : null;

export const isHhRecording = (archive) =>
  Boolean(
    archive &&
    typeof archive === 'object' &&
    !Array.isArray(archive) &&
    Object.keys(archive).some(nativeId)
  );

const validateRecordedMessage = (message, previousTexts, seen) => {
  if (
    !nativeId(message?.id) ||
    seen.has(message.id) ||
    typeof message.mine !== 'boolean' ||
    !text(message.text, 12000).trim() ||
    !Array.isArray(previousTexts) ||
    previousTexts.length > 128 ||
    previousTexts.some((value) => !text(value, 12000).trim()) ||
    (!message.mine && previousTexts.length > 0)
  ) {
    throw invalid();
  }
};

const parseHhRecording = (archive) => {
  const seen = new Set();
  return Object.entries(archive).flatMap(([id, chat]) => {
    if (!nativeId(id) || !Array.isArray(chat?.messages)) {
      throw invalid();
    }
    const at = recordedAt(chat.at);
    const chatName = text(chat.vacancy, 4096);
    return chat.messages.map((message) => {
      const { previousTexts = [] } = message ?? {};
      validateRecordedMessage(message, previousTexts, seen);
      const title = text(message.title, 4096);
      const heading = text(message.heading, 4096);
      seen.add(message.id);
      return {
        ...buildMessageLink({
          source: 'hh',
          externalId: `web:${id}:${message.id}`,
          chat: `web:${id}`,
          sender: message.mine ? 'me' : title,
          body: message.text,
          timestamp: null,
          outgoing: message.mine,
          delivery: message.mine ? 'unknown' : null,
          service:
            applicationTitle.test(title) || applicationTitle.test(heading),
        }),
        via: 'archive',
        ...(chatName ? { chatName } : {}),
        raw: {
          id: message.id,
          title,
          heading,
          hhRecording: {
            recordedAt: at,
            historyComplete: chat.historyComplete === true,
            ...(Number.isSafeInteger(chat.recordingVersion)
              ? { version: chat.recordingVersion }
              : {}),
          },
        },
        [importMessageVersions]: [...new Set(previousTexts)].filter(
          (value) => value !== message.text
        ),
      };
    });
  });
};

export const parseHhArchive = (archive) => {
  const data = typeof archive === 'string' ? JSON.parse(archive) : archive;
  return isHhRecording(data)
    ? parseHhRecording(data)
    : normalizeHhMessages(data, { legacyFlat: true });
};
