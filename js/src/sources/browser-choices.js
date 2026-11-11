import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  readBrowserChoices,
  browserChoiceSuggestions,
} from './browser-choice-reader.js';
import {
  createChoiceContext,
  readChoicePublic,
  prefillChoiceDraft,
  armChoiceClick,
  readChoiceReceipt,
  releaseChoiceClick,
} from './browser-choice-controller.js';
import { answerChoiceState } from '../automation/question-options.js';
import { resolveBrowserChoiceDocument } from './browser-choice-document.js';
import { openBrowserAnswerWatch } from './browser-answer-watch.js';

// Only these application functions become code. Provider strings remain args.
const methods = {
  read: readChoicePublic,
  prefill: prefillChoiceDraft,
  arm: armChoiceClick,
  receipt: readChoiceReceipt,
  release: releaseChoiceClick,
};
const source = `(input) => {
  const browserChoiceSuggestions = (${browserChoiceSuggestions.toString()});
  const context = (${createChoiceContext.toString()})(input, ${readBrowserChoices.toString()});
  const methods = {${Object.entries(methods)
    .map(([name, method]) => `${name}: ${method.toString()}`)
    .join(',')}};
  return methods[input.operation](input, context);
}`;
// Playwright serializes functions, whereas a string expression is not called.
// This source contains exclusively the static functions above, never page data.
export const browserChoicePage = new Function(`return (${source})`)();
const failure = (code) =>
  Object.assign(
    new Error(
      {
        'answer-draft-preserved':
          'The provider composer contains an owner draft; review it before selecting an answer',
        'send-unknown':
          'The option may have been selected; inspect the provider chat before trying again',
        'send-in-doubt':
          'This question already has a selection attempt; inspect the provider chat before trying again',
      }[code] ??
        'The current provider question or answer controls could not be verified'
    ),
    {
      code,
      fallback: false,
      ...(['send-unknown', 'send-in-doubt'].includes(code)
        ? { ambiguous: true, outcome: 'unknown' }
        : {}),
    }
  );

export const browserChoiceSpec = (ui) => {
  if (
    !ui.choices ||
    !ui.location ||
    !ui.messages.idPattern ||
    !ui.messages.outgoing
  ) {
    throw failure('answer-choice-required');
  }
  return {
    choices: ui.choices,
    location: ui.location,
    messages: ui.messages,
    composer: ui.composer,
  };
};

const evaluate = (commander, input) =>
  commander.evaluate({ fn: browserChoicePage, args: [input] });

export const readBrowserAnswerChoices = async (commander, ui, target) => {
  const value = await evaluate(commander, {
    spec: browserChoiceSpec(ui),
    operation: 'read',
  });
  if (value.code || value.chat !== String(target)) {
    throw failure(value.code ?? 'answer-chat-unverified');
  }
  const choices = answerChoiceState(value.question.body, {
    options: value.answerOptions,
    strictOptions: value.strictOptions,
  });
  return { ...value, ...choices, answerOptions: choices.options };
};

export const enrichBrowserChoices = async (commander, ui, target, rows) => {
  if (!ui.choices) {
    return rows;
  }
  const current = await readBrowserAnswerChoices(commander, ui, target);
  if (
    !Array.isArray(rows) ||
    rows.filter((row) => String(row.id) === current.question.id).length !== 1
  ) {
    throw failure('answer-choice-changed');
  }
  return rows.map((row) =>
    String(row.id) === current.question.id
      ? {
          ...row,
          body: current.question.body,
          strictOptions: current.strictOptions,
          answerOptions: current.answerOptions,
        }
      : row
  );
};

export const prefillBrowserAnswer = async (commander, ui, expected, text) => {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 6000 ||
    answerChoiceState(expected.question.body, {
      options: expected.answerOptions,
    }).strictOptions
  ) {
    throw failure('bad-draft');
  }
  const result = await evaluate(commander, {
    spec: browserChoiceSpec(ui),
    operation: 'prefill',
    expected,
    text,
  });
  if (!result.prefilled) {
    throw failure(result.code);
  }
  return result;
};

const expectedQuestion = (draft, target) => {
  const messages = draft.answer?.turn?.messages;
  const question = messages?.length === 1 && messages[0];
  const prefix = `msg:${draft.source}:${target}:`;
  if (
    !question ||
    question.id !== draft.answer.message ||
    typeof question.id !== 'string' ||
    !question.id.startsWith(prefix) ||
    typeof question.body !== 'string' ||
    question.body.length > 6000 ||
    draft.text !== draft.answer.option ||
    !draft.answer.strictOptions
  ) {
    throw failure('answer-choice-required');
  }
  let answerOptions;
  try {
    answerOptions = JSON.parse(question.options);
    answerChoiceState(question.body, {
      options: answerOptions,
      strictOptions: true,
    });
  } catch {
    throw failure('answer-choice-required');
  }
  return {
    chat: String(target),
    question: { id: question.id.slice(prefix.length), body: question.body },
    answerOptions,
  };
};

/** One native click followed by a provider-message receipt; no text fallback. */
const validWait = (receiptMs, pollMs) =>
  Number.isSafeInteger(receiptMs) &&
  receiptMs >= 0 &&
  receiptMs <= 30000 &&
  Number.isSafeInteger(pollMs) &&
  pollMs >= 1 &&
  pollMs <= 1000;

export const selectBrowserAnswer = async (
  commander,
  ui,
  draft,
  target,
  { receiptMs = 10000, pollMs = 100 } = {}
) => {
  if (!validWait(receiptMs, pollMs)) {
    throw failure('bad-draft');
  }
  const expected = expectedQuestion(draft, target);
  const spec = browserChoiceSpec(ui);
  const token = randomBytes(16).toString('hex');
  const input = { spec, expected, token, option: draft.answer.option };
  try {
    const armed = await evaluate(commander, { ...input, operation: 'arm' });
    if (!armed.armed) {
      throw failure(armed.code);
    }
    try {
      await commander.clickButton({
        selector: armed.selector,
        scrollIntoView: true,
        waitForNavigation: false,
        waitAfterClick: 0,
        verify: false,
      });
    } catch {
      // Dispatch can already have happened even when the native click rejects.
    }
    const deadline = Date.now() + receiptMs;
    for (;;) {
      let result;
      const finish = Date.now() >= deadline;
      try {
        result = await evaluate(commander, {
          ...input,
          operation: 'receipt',
          finish,
        });
      } catch {
        throw failure('send-unknown');
      }
      if (result.sent) {
        return {
          via: 'browser',
          source: draft.source,
          chat: String(target),
          messageId: result.messageId,
          option: draft.answer.option,
        };
      }
      if (finish) {
        throw failure(result.code);
      }
      await sleep(pollMs);
    }
  } finally {
    try {
      await evaluate(commander, { ...input, operation: 'release' });
    } catch {
      // A detached document cannot retain live hooks. Preserve the outcome.
    }
  }
};

export const createBrowserChoiceActions = ({
  inChat,
  queue,
  uiFor,
  receiptMs,
  pollMs,
}) => {
  const watches = new Set();
  const handles = new Set();
  const opening = new Set();
  let closed = false;
  return {
    async closeAnswerWatches() {
      closed = true;
      await Promise.allSettled([...opening]);
      await Promise.allSettled([...handles].map((handle) => handle.close()));
    },
    async openAnswerWatch({ source, chat, to, browserUrl } = {}) {
      const ui = uiFor(source);
      const target = ui.target({ chat, to });
      if (closed || !ui.documents || !queue || watches.has(source)) {
        throw failure('question-watch-unavailable');
      }
      watches.add(source);
      let handle;
      const pending = inChat(
        source,
        target,
        { browserUrl },
        (commander, page) =>
          openBrowserAnswerWatch({
            commander,
            page,
            ui,
            target,
            receiptMs,
            pollMs,
            queue: (work) => queue(source, work),
            released: () => {
              watches.delete(source);
              handles.delete(handle);
            },
          })
      );
      opening.add(pending);
      try {
        handle = await pending;
        handles.add(handle);
        if (closed) {
          await handle.close();
          throw failure('question-watch-unavailable');
        }
        return handle;
      } catch (error) {
        watches.delete(source);
        throw error;
      } finally {
        opening.delete(pending);
      }
    },
    /** Strict choices bypass API/plain-text sending and require a receipt. */
    async chooseAnswer(draft) {
      const ui = uiFor(draft.source);
      browserChoiceSpec(ui);
      const target = ui.target({
        chat: draft.chat,
        to: draft.contact ?? draft.to,
      });
      return inChat(
        draft.source,
        target,
        { browserUrl: draft.browserUrl },
        async (commander, page) =>
          selectBrowserAnswer(
            await resolveBrowserChoiceDocument(commander, page, ui, target),
            ui,
            draft,
            target,
            {
              receiptMs,
              pollMs,
            }
          )
      );
    },

    /** Inspect provider choices and clear only an unchanged owned draft. */
    async readAnswerChoices({ source, chat, to, browserUrl } = {}) {
      const ui = uiFor(source);
      const target = ui.target({ chat, to });
      return inChat(source, target, { browserUrl }, async (commander, page) =>
        readBrowserAnswerChoices(
          await resolveBrowserChoiceDocument(commander, page, ui, target),
          ui,
          target
        )
      );
    },

    /** Retain ownership only for a verified write into an empty provider input. */
    async prefillAnswer({ source, chat, to, browserUrl, expected, text } = {}) {
      const ui = uiFor(source);
      const target = ui.target({ chat, to });
      if (expected?.chat !== String(target)) {
        throw failure('answer-chat-unverified');
      }
      return inChat(source, target, { browserUrl }, async (commander, page) =>
        prefillBrowserAnswer(
          await resolveBrowserChoiceDocument(commander, page, ui, target),
          ui,
          expected,
          text
        )
      );
    },
  };
};
