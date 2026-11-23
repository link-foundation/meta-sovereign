import { assignmentFormUrl } from '../forms/assignment-recognition.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { hhVacancyId } from '../sources/hh-context.js';
import { sourceMessageLinkProperties } from '../sources/message-text-links.js';
import { assignmentFailure, assignmentVacancyUrl } from './validation.js';

const associationId = async (url) =>
  `form-vacancy:${await modelFingerprint(assignmentFormUrl(url))}`;
const messageVacancies = (message) => {
  const chat = message.hhChat;
  const commonId =
    typeof chat?.id === 'string' &&
    chat.id &&
    message.chat === `chat:${chat.id}` &&
    message.id.startsWith(`msg:hh:${message.chat}:`)
      ? chat.vacancyId
      : null;
  const evidence = message.answerContext?.evidence;
  const context =
    typeof evidence === 'string'
      ? evidence.match(/^vacancy:hh:(\d{1,20})$/u)?.[1]
      : undefined;
  return [message.raw?.vacancy?.id, context, commonId]
    .map(hhVacancyId)
    .filter(Boolean);
};
const matchesFormUrl = (value, wanted) => {
  try {
    return wanted.has(assignmentFormUrl(value));
  } catch {
    return false;
  }
};
const containsFormUrl = (message, wanted) => {
  const { links } = sourceMessageLinkProperties(message);
  if (links !== undefined) {
    return links?.some((link) => matchesFormUrl(link, wanted)) ?? false;
  }
  const { body } = message;
  return (
    typeof body === 'string' &&
    body.length <= 30000 &&
    (body.match(/https?:\/\/[^\s<>"'()]+/gu) ?? []).some((value) =>
      matchesFormUrl(value.replace(/[.,;!?]+$/u, ''), wanted)
    )
  );
};

/** Link exact original/redirect aliases only from actual stored HH messages. */
export const rememberAssignmentVacancy = async (store, urls) => {
  if (!Array.isArray(urls) || !urls.length || urls.length > 10) {
    throw assignmentFailure('input', 'Use at most ten form URL aliases.');
  }
  const wanted = new Set(urls.map(assignmentFormUrl));
  const found = new Map();
  const inspect = (batch) => {
    for (const message of batch) {
      const ids = messageVacancies(message);
      if (!ids.length || !containsFormUrl(message, wanted)) {
        continue;
      }
      for (const id of ids) {
        const vacancyUrl = `https://hh.ru/vacancy/${id}`;
        found.set(vacancyUrl, {
          vacancyUrl,
          sourceMessageId: message.id,
          sourceChat: String(message.chat),
          aliases: [...wanted],
        });
      }
    }
  };
  const filter = (row) =>
    row.source === 'hh' && row.id?.startsWith('msg:hh:') && !row.deleted;
  if (typeof store.scan === 'function') {
    await store.scan(filter, 32, inspect);
  } else {
    inspect(await store.query(filter));
  }
  if (found.size > 1) {
    throw assignmentFailure(
      'vacancy-ambiguous',
      'This form appears in chats for different vacancies. Choose a vacancy URL.'
    );
  }
  const association = [...found.values()][0];
  if (!association) {
    return null;
  }
  for (const formUrl of wanted) {
    await store.put({
      id: await associationId(formUrl),
      version: 1,
      tokens: ['forms', 'vacancy'],
      children: [],
      formUrl,
      ...association,
    });
  }
  await store.flush?.();
  return association;
};

export const storedAssignmentVacancy = async (store, url) => {
  const formUrl = assignmentFormUrl(url);
  const record = await store.get(await associationId(formUrl));
  if (!record) {
    return null;
  }
  if (
    record.version !== 1 ||
    record.formUrl !== formUrl ||
    !record.sourceMessageId?.startsWith('msg:hh:') ||
    !Array.isArray(record.aliases) ||
    record.aliases.length > 10 ||
    !record.aliases.includes(formUrl) ||
    record.aliases.some((alias) => assignmentFormUrl(alias) !== alias)
  ) {
    throw assignmentFailure(
      'vacancy-invalid',
      'The saved form vacancy association is invalid.'
    );
  }
  return { ...record, vacancyUrl: assignmentVacancyUrl(record.vacancyUrl) };
};

export const rememberAssignmentRedirect = async (store, original, resolved) => {
  if (!store?.get || typeof resolved !== 'string') {
    return;
  }
  try {
    await rememberAssignmentVacancy(store, [original, resolved]);
  } catch (error) {
    // Reading a form remains possible; drafting requires an explicit vacancy.
    if (error.code !== 'assignment-vacancy-ambiguous') {
      throw error;
    }
  }
};
