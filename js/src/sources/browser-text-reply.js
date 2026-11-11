import { answerChoiceState } from '../automation/question-options.js';
import { checkedBrowserPendingTurn } from './browser-pending-turn.js';
import { browserChoiceSpec, dispatchBrowserReply } from './browser-choices.js';
import { resolveBrowserChoiceDocument } from './browser-choice-document.js';

const failure = (code) =>
  Object.assign(
    new Error('The frozen provider text reply could not be verified.'),
    { code, fallback: false }
  );

const checkedTextSnapshot = (target, expected) => {
  const question = expected?.question;
  const pendingTurn =
    question && checkedBrowserPendingTurn(expected.pendingTurn, question);
  if (
    expected?.chat !== String(target) ||
    expected.strictOptions !== false ||
    !Array.isArray(expected.answerOptions) ||
    expected.answerOptions.length ||
    !question ||
    question.outgoing !== false ||
    !pendingTurn ||
    answerChoiceState(question.body, { options: [] }).strictOptions
  ) {
    throw failure('bad-draft');
  }
  return {
    chat: String(target),
    strictOptions: false,
    question: { id: question.id, body: question.body, outgoing: false },
    pendingTurn,
    answerOptions: [],
  };
};

/** Require explicit free-text capability and a bounded whole pending turn. */
export const checkedTextReply = (ui, target, expected, text) => {
  if (!ui.documents || !ui.textReply?.send || !ui.textReply.closedText) {
    throw failure('answer-text-unavailable');
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 12000) {
    throw failure('bad-draft');
  }
  return checkedTextSnapshot(target, expected);
};

/** Receipt, not a successful click or emptied composer, establishes delivery. */
export const sendBrowserTextReply = async (
  commander,
  ui,
  target,
  expected,
  text,
  options = {}
) => {
  const frozen = checkedTextReply(ui, target, expected, text);
  const result = await dispatchBrowserReply(
    commander,
    { spec: browserChoiceSpec(ui), expected: frozen, text },
    {
      receiptMs: options.receiptMs ?? 10000,
      pollMs: options.pollMs ?? 100,
    }
  );
  return {
    via: 'browser',
    source: ui.id,
    chat: String(target),
    messageId: result.messageId,
    text,
  };
};

/** Queue explicit frozen replies, cancel pending admission and drain dispatches. */
export const createBrowserTextActions = ({
  uiFor,
  inChat,
  receiptMs,
  pollMs,
}) => {
  const pending = new Map();
  let closed = false;
  return {
    async closeTextReplies() {
      closed = true;
      for (const controller of pending.values()) {
        controller.abort();
      }
      await Promise.allSettled([...pending.keys()]);
    },
    async replyText({ source, chat, to, browserUrl, expected, text } = {}) {
      if (closed) {
        throw failure('answer-text-unavailable');
      }
      const ui = uiFor(source);
      const target = ui.target({ chat, to });
      const frozen = checkedTextReply(ui, target, expected, text);
      const controller = new AbortController();
      const result = inChat(
        source,
        target,
        { browserUrl, signal: controller.signal },
        async (commander, page) => {
          if (closed) {
            throw failure('answer-text-unavailable');
          }
          return sendBrowserTextReply(
            await resolveBrowserChoiceDocument(commander, page, ui, target),
            ui,
            target,
            frozen,
            text,
            { receiptMs, pollMs }
          );
        }
      );
      pending.set(result, controller);
      try {
        return await result;
      } finally {
        pending.delete(result);
      }
    },
  };
};
