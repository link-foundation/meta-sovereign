import { answerChoiceState } from '../automation/question-options.js';
import { messageLinkProperties } from '../message-link-targets.js';
import { checkedBrowserPendingTurn } from './browser-pending-turn.js';
import {
  browserChoiceSpec,
  dispatchBrowserReply,
  readBrowserManualBoundary,
} from './browser-choices.js';
import { resolveBrowserChoiceDocument } from './browser-choice-document.js';
import { withInactiveBrowserView } from './browser-inactive-view.js';
import { createBrowserSendConsent } from './browser-send-consent.js';
import { toBrowserMessageLink } from './browser-message.js';

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
    question: {
      id: question.id,
      body: question.body,
      outgoing: false,
      ...messageLinkProperties(question.links),
    },
    pendingTurn,
    answerOptions: [],
    ...(expected.noticeContext
      ? { noticeContext: expected.noticeContext }
      : {}),
  };
};

const requireTextCapability = (ui, text) => {
  if (!ui.documents || !ui.textReply?.send || !ui.textReply.closedText) {
    throw failure('answer-text-unavailable');
  }
  if (typeof text !== 'string' || !text.trim() || text.length > 12000) {
    throw failure('bad-draft');
  }
};

/** Require explicit free-text capability and a bounded whole pending turn. */
export const checkedTextReply = (ui, target, expected, text) => {
  requireTextCapability(ui, text);
  return checkedTextSnapshot(target, expected);
};

const sendManualText = async (document, ui, target, text, options) => {
  const expected = await readBrowserManualBoundary(document, ui, target);
  const { boundary } = expected;
  if (boundary.outgoing && ['pending', 'unknown'].includes(boundary.delivery)) {
    throw Object.assign(
      new Error(
        'Check delivery of the previous HeadHunter message before sending again.'
      ),
      { code: 'send-in-doubt', fallback: false, ambiguous: true }
    );
  }
  const { messageId, message } = await dispatchBrowserReply(
    document,
    { spec: browserChoiceSpec(ui), expected, text, manual: true },
    options
  );
  return {
    via: 'browser',
    source: ui.id,
    chat: String(target),
    messageId,
    text,
    link: toBrowserMessageLink(ui.id, String(target), message),
  };
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
      inactiveToken: options.inactiveToken,
      verifyCurrent: options.verifyCurrent,
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

/** An existing inactive view may issue once; only its actual receipt survives. */
export const sendInactiveBrowserTextReply = async (
  document,
  ui,
  target,
  expected,
  text,
  options
) => {
  let receipt;
  try {
    return await withInactiveBrowserView(
      document,
      async (inactive, token) => {
        receipt = await sendBrowserTextReply(
          document,
          ui,
          target,
          expected,
          text,
          {
            ...options,
            inactiveToken: token,
            verifyCurrent: async () => {
              await options.verifyCurrent();
              await inactive();
            },
          }
        );
        return receipt;
      },
      { relayOwner: true }
    );
  } catch (error) {
    // Later activity cannot erase a positive outgoing receipt. An uncertain
    // dispatch never sets this private value and still propagates its error.
    if (receipt) {
      return receipt;
    }
    throw error;
  }
};

/** Queue explicit frozen replies, cancel pending admission and drain dispatches. */
export const createBrowserTextActions = ({
  store,
  uiFor,
  inChat,
  receiptMs,
  pollMs,
}) => {
  const pending = new Map();
  let closed = false;
  const requireOpen = () => {
    if (closed) {
      throw failure('answer-text-unavailable');
    }
  };
  return {
    async closeTextReplies() {
      closed = true;
      for (const controller of pending.values()) {
        controller.abort();
      }
      await Promise.allSettled([...pending.keys()]);
    },
    async sendManualText(draft, dispatch) {
      const { source, chat, to, text } = draft;
      const ui = uiFor(source);
      requireOpen();
      requireTextCapability(ui, text);
      const target = ui.target({ chat, to });
      const consent = createBrowserSendConsent(store, draft, dispatch);
      const verifyCurrent = async () => {
        await consent();
        requireOpen();
      };
      return inChat(
        source,
        target,
        { beforeOpen: verifyCurrent, signal: dispatch.signal },
        async (commander, page) =>
          sendManualText(
            await resolveBrowserChoiceDocument(commander, page, ui, target),
            ui,
            target,
            text,
            { receiptMs, pollMs, verifyCurrent }
          )
      );
    },
    async replyText({
      source,
      chat,
      to,
      contact,
      browserUrl,
      expected,
      text,
    } = {}) {
      requireOpen();
      const ui = uiFor(source);
      const target = ui.target({ chat, to });
      const frozen = checkedTextReply(ui, target, expected, text);
      const consent = createBrowserSendConsent(store, {
        source,
        chat,
        to,
        contact,
      });
      const verifyCurrent = async () => {
        await consent();
        requireOpen();
      };
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
            { receiptMs, pollMs, verifyCurrent }
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
