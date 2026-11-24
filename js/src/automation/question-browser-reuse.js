import { strictSummaryPairs } from './question-summary.js';
import { approvedBrowserPlan } from './question-browser-plan.js';
import { previewAnswer } from './question-store.js';
import { loadSettings, optOutEntry, quietMsLeft } from './safety.js';

const OFFER =
  /^(?:(?:используем|использовать|использовать ли) (?:эти|те же|ваши) ответы|(?:shall we|would you like to|do you want to) (?:use|reuse) (?:these|the same|your) answers|(?:use|reuse) (?:these|the same|your) answers)\s*[?？]?$/iu;
const INTRO =
  /^(?:похоже, вы отвечали на часть вопросов|it looks like you(?: have|'ve)? answered some (?:of the )?questions)[.:：]?$/iu;
const YES =
  /^(?:да|yes)(?:[.,!]\s*(?:используем те же ответы|use the same answers))?[.!]?$/iu;
const NO =
  /^(?:нет|no)(?:[.,!]\s*(?:отвечу заново|i(?: will|'ll) answer again))?[.!]?$/iu;

const lines = (body) => body.trim().split(/\r?\n/u);

export const isBrowserReuseOffer = (source, snapshot) =>
  source === 'hh' &&
  !snapshot.question.outgoing &&
  OFFER.test(lines(snapshot.question.body).at(-1).trim());

export const approvedSavedReply = (plan, question) => {
  const candidate = plan.matchResults?.items[0];
  return (
    approvedBrowserPlan(plan) &&
    !plan.noReply &&
    !plan.noReplyProposed &&
    !plan.pending?.limited &&
    plan.match === 'exact' &&
    plan.matchResults?.complete === true &&
    candidate?.selected === true &&
    candidate.approved === true &&
    candidate.question === question &&
    candidate.text === plan.text
  );
};

export const automaticBrowserReplyAllowed = async (
  store,
  source,
  chat,
  now = Date.now()
) => {
  const settings = await loadSettings(store);
  return (
    !optOutEntry(settings, { source, chat }) &&
    !optOutEntry(settings, { source, chat: `web:${chat}` }) &&
    !quietMsLeft(now, settings)
  );
};

const offeredPairs = (snapshot) => {
  const messages = snapshot.pendingTurn?.messages;
  if (!messages?.length || snapshot.question.links?.length) {
    return [];
  }
  const prefix = lines(snapshot.question.body).slice(0, -1);
  const prior = messages.slice(0, -1);
  const blocks = [...prior.map((row) => lines(row.body)), prefix];
  const header = blocks.findLastIndex((block) => INTRO.test(block[0]?.trim()));
  if (header !== -1) {
    if (prior.slice(header).some((row) => row.links?.length)) {
      return [];
    }
    return strictSummaryPairs(
      [
        'Your answers:',
        ...blocks[header].slice(1),
        ...blocks.slice(header + 1).flat(),
      ].join('\n')
    );
  }
  if (prefix.length) {
    return strictSummaryPairs(prefix.join('\n'));
  }
  const summary = prior.at(-1);
  return summary && !summary.links?.length
    ? strictSummaryPairs(summary.body)
    : [];
};

const sameAnswer = (first, second) => {
  const normalize = (text) => {
    const clean = text
      .normalize('NFC')
      .trim()
      .toLowerCase()
      .replace(/[.!。！]+$/u, '');
    if (clean === 'да') {
      return 'yes';
    }
    return clean === 'нет' ? 'no' : clean;
  };
  return normalize(first) === normalize(second);
};

/** Compare only exact approved saved answers against this provider's offer. */
export const planBrowserReuse = async (store, input, snapshot) => {
  if (
    !isBrowserReuseOffer(input.source, snapshot) ||
    !snapshot.strictOptions ||
    snapshot.hasDraft ||
    !snapshot.noticeContext
  ) {
    return null;
  }
  const yes = snapshot.answerOptions.filter((label) => YES.test(label.trim()));
  const no = snapshot.answerOptions.filter((label) => NO.test(label.trim()));
  if (
    yes.length !== 1 ||
    no.length !== 1 ||
    snapshot.answerOptions.length !== 2
  ) {
    return null;
  }
  const pairs = offeredPairs(snapshot);
  if (
    !pairs.length ||
    new Set(pairs.map(({ question }) => question)).size !== pairs.length
  ) {
    return null;
  }
  const comparisons = [];
  for (const { question } of pairs) {
    const plan = await previewAnswer(store, {
      ...input,
      question,
      options: [],
      strictOptions: false,
      links: undefined,
      pendingMessages: undefined,
      modelDraft: false,
      matchPage: { offset: 0, limit: 1 },
    });
    comparisons.push(approvedSavedReply(plan, question) ? plan.text : null);
  }
  const equal = pairs.map(({ text }, index) =>
    comparisons[index] === null ? null : sameAnswer(text, comparisons[index])
  );
  const option = equal.includes(false)
    ? no[0]
    : equal.every((value) => value === true)
      ? yes[0]
      : null;
  return option ? { option, comparisons } : null;
};
