import { createHash } from 'node:crypto';
import { assignmentVacancyUrl } from '../assignments/validation.js';
import {
  acknowledgedBrowserTurn,
  hasDatedBrowserReply,
} from '../automation/question-observed-history.js';
import { learnObservedAnswers } from '../automation/question-store.js';
import { summaryAnswerPairs } from '../automation/question-summary.js';
import { completedHandover } from '../automation/question-notice-intent.js';
import { resolveOpenBrowserConversation } from '../sources/browser-choice-document.js';
import {
  readBrowserHistory,
  readBrowserPanelDismissalBoundary,
  readBrowserVacancyHeader,
} from '../sources/browser-choices.js';
import { archiveBrowserHistoryWindow } from '../sources/browser-history-archive.js';
import { HH_WEB_UI } from '../sources/hh-web-ui.js';
import { reviewRecruiterAnswer } from './application-recruiter-draft.js';

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

const terminalNotice = (row) =>
  row &&
  !row.outgoing &&
  !row.service &&
  !row.links?.length &&
  !row.strictOptions &&
  completedHandover(row.body);

const pendingRecruiterMessage = (row) =>
  Boolean(row?.body && !row.outgoing && !row.service && !terminalNotice(row));

const firstRecruiterMessageWaitMs = 20_000;
const nextRecruiterMessageWaitMs = 15_000;
const quietRecruiterPanel = (document, boundary, capture, dismissal) => {
  if (!dismissal || !boundary.ready) {
    return undefined;
  }
  const latest = boundary.messages.findLast(
    (row) => !row.service || row.links?.length || row.strictOptions
  );
  const empty = !latest && (boundary.messages.length || !capture);
  // The browser boundary already refused any uncertain outgoing rows.
  const answered =
    latest?.outgoing && !latest.service && latest.body && !latest.strictOptions;
  if (!empty && !answered) {
    return undefined;
  }
  const key = historyKey(document.identity, [boundary.header, capture]);
  const now = dismissal.now();
  const previous = dismissal.quiet;
  const since =
    previous?.key === key && previous.since <= now ? previous.since : now;
  const elapsed = now - since;
  return {
    key,
    since,
    ready:
      elapsed >=
      (empty ? firstRecruiterMessageWaitMs : nextRecruiterMessageWaitMs),
  };
};

const recruiterPanelDecision = async (document, vacancy, capture, options) => {
  const { dismissal, skip, offerSkip, signal } = options;
  if (!dismissal && !skip && !offerSkip) {
    return {};
  }
  const read = () => readBrowserPanelDismissalBoundary(document, recruiterUi);
  const boundary = await read();
  const chat = `web:${document.chat}`;
  if (
    boundary?.chat !== document.chat ||
    !sameVacancy(boundary.header.vacancyUrl, vacancy) ||
    (boundary.messages.length &&
      historyKey(chat, boundary.messages) !== capture)
  ) {
    return {};
  }
  const latest = boundary.messages.at(-1);
  const skipCapture =
    !boundary.disabled && pendingRecruiterMessage(latest)
      ? historyKey(document.identity, [boundary.header, capture])
      : undefined;
  const quiet = quietRecruiterPanel(document, boundary, capture, dismissal);
  const reason = skip
    ? skipCapture === skip.capture && 'skipped'
    : dismissal?.defer
      ? 'deferred'
      : dismissal &&
        (boundary.disabled || terminalNotice(latest)
          ? 'completed'
          : quiet?.ready && 'quiet');
  if (
    reason &&
    (await document.dismissOwnerPanel({
      verify: async () =>
        JSON.stringify(await read()) === JSON.stringify(boundary),
      admit: (skip ?? dismissal).check,
      signal,
    }))
  ) {
    return { dismissed: reason };
  }
  return { skipCapture: offerSkip ? skipCapture : undefined, quiet };
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
  let decision = {};
  try {
    decision = await recruiterPanelDecision(
      document,
      vacancy,
      capture,
      options
    );
    if (decision.dismissed) {
      options.trace({
        event: 'application-recruiter-dismissal',
        state: decision.dismissed,
      });
      return { matched: false, capture, dismissed: decision.dismissed };
    }
  } catch {
    options.signal.throwIfAborted();
    options.trace({
      event: 'application-recruiter-dismissal',
      state: 'unverified',
    });
  }
  let reply;
  try {
    if (!options.skip) {
      reply = await reviewRecruiterAnswer(
        document,
        recruiterUi,
        vacancy,
        options
      );
    }
    if (reply) {
      options.trace({
        event: 'application-recruiter-answer',
        state: reply,
      });
    }
  } catch {
    options.signal.throwIfAborted();
    options.trace({
      event: 'application-recruiter-answer',
      state: 'unverified',
    });
  }
  return {
    matched: Boolean(
      sameVacancy(
        (await readHeader(document).catch(() => null))?.vacancyUrl,
        vacancy
      )
    ),
    capture,
    ...(decision.quiet && { quiet: decision.quiet }),
    ...(!reply && decision.skipCapture
      ? { skipCapture: decision.skipCapture }
      : {}),
    ...(reply && reply !== 'draft' ? { reply } : {}),
  };
};
