import { createHash } from 'node:crypto';
import { assignmentVacancyUrl } from '../assignments/validation.js';
import {
  acknowledgedBrowserTurn,
  hasDatedBrowserReply,
} from '../automation/question-observed-history.js';
import { learnObservedAnswers } from '../automation/question-store.js';
import { summaryAnswerPairs } from '../automation/question-summary.js';
import { resolveOpenBrowserConversation } from '../sources/browser-choice-document.js';
import {
  readBrowserHistory,
  readBrowserVacancyHeader,
} from '../sources/browser-choices.js';
import { archiveBrowserHistoryWindow } from '../sources/browser-history-archive.js';
import { HH_WEB_UI } from '../sources/hh-web-ui.js';
import { prepareRecruiterDraft } from './application-recruiter-draft.js';

const recruiterUi = {
  ...HH_WEB_UI,
  documents: {
    ...HH_WEB_UI.documents,
    ownerOrigins: ['https://hh.ru', 'https://www.hh.ru'],
    frameOrigins: ['https://chatik.hh.ru'],
    ownerPanel: '[data-qa="chatik-root"]',
    chatIdentity: 'html',
  },
};

const readHeader = (document) =>
  readBrowserVacancyHeader(document, recruiterUi);
const sameVacancy = (url, vacancy) =>
  url && assignmentVacancyUrl(url) === vacancy;
const historyKey = (chat, rows) =>
  createHash('sha256')
    .update(JSON.stringify([chat, rows]))
    .digest('hex');

const saveRecruiterHistory = async (
  document,
  header,
  vacancy,
  { store, previous, profileId, signal }
) => {
  const chat = `web:${document.chat}`;
  const read = () => readBrowserHistory(document, recruiterUi, document.chat);
  const rows = await read();
  const key = historyKey(chat, rows);
  if (!rows.length || key === previous) {
    return previous;
  }
  const valid = (items) =>
    items.every((row) => sameVacancy(row.hhVacancyUrl, vacancy));
  if (
    !valid(rows) ||
    !sameVacancy((await readHeader(document))?.vacancyUrl, vacancy)
  ) {
    return previous;
  }
  signal.throwIfAborted();
  await archiveBrowserHistoryWindow(store, {
    source: 'hh',
    chat,
    chatName: header.company,
    rows,
    signal,
  });
  const hasSummary = rows.some(
    (row) =>
      !row.outgoing && !row.service && summaryAnswerPairs(row.body).length
  );
  if (hasDatedBrowserReply(rows) || hasSummary) {
    const learned = await learnObservedAnswers(
      store,
      { profileId },
      {
        signal,
        readCurrent: async () => {
          const current = await read();
          if (historyKey(chat, current) !== key) {
            return null;
          }
          return acknowledgedBrowserTurn(
            store,
            'hh',
            chat,
            current,
            signal,
            vacancy.split('/').at(-1)
          );
        },
      }
    );
    if (learned === null) {
      return previous;
    }
  }
  return key;
};

/** Read one vacancy-bound panel and archive its observed native messages. */
export const readApplicationRecruiterPanel = async (
  { commander, page },
  vacancy,
  options
) => {
  const document = await resolveOpenBrowserConversation(
    commander,
    page,
    recruiterUi
  );
  const header = await readHeader(document);
  if (!sameVacancy(header?.vacancyUrl, vacancy)) {
    return { matched: false };
  }
  let capture = options.previous;
  try {
    capture = await saveRecruiterHistory(document, header, vacancy, options);
  } catch {
    options.signal.throwIfAborted();
    options.trace({
      event: 'application-recruiter-history',
      state: 'unverified',
    });
  }
  try {
    if (await prepareRecruiterDraft(document, recruiterUi, vacancy, options)) {
      options.trace({
        event: 'application-recruiter-draft',
        state: 'verified',
      });
    }
  } catch {
    options.signal.throwIfAborted();
    options.trace({
      event: 'application-recruiter-draft',
      state: 'unverified',
    });
  }
  return {
    matched: Boolean(
      sameVacancy((await readHeader(document))?.vacancyUrl, vacancy)
    ),
    capture,
  };
};
