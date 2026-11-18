import { browserAnswerPlanning } from './question-browser-context.js';
import { prepareAnswerPreview, previewAnswer } from './question-store.js';
import { planAnswer } from './question-answers.js';
import { vacancySnapshot } from '../assignments/vacancy.js';
import { assignmentVacancyUrl } from '../assignments/validation.js';
import { noticeVacancyUrl } from '../sources/browser-notice-context.js';
import {
  salaryCurrencies,
  recognizedSalaryCurrencies,
  unknownSalaryCurrency,
} from './salary-question.js';

export const browserQuestionInput = (target, snapshot, input) => ({
  ...input,
  source: target.source,
  chat: snapshot.chat,
  question: snapshot.question.body,
  links: snapshot.question.links,
  pendingMessages: snapshot.pendingTurn?.messages,
  options: snapshot.answerOptions,
  strictOptions: snapshot.strictOptions,
});

const dependsOnCurrency = (plan) =>
  [plan, ...(plan.parts ?? [])].some(
    (part) =>
      part.salary &&
      part.contexts?.some(
        (context) =>
          context.key === 'salary_currency' &&
          ['default', 'missing', 'saved-answer'].includes(context.source)
      )
  );
const tellsCurrency = (text, config) =>
  salaryCurrencies(text, config).length > 0 ||
  unknownSalaryCurrency(text, config);

// The complete page remains in the vacancy cache or current run. Only currency clues
// are needed here when its description exceeds the answer environment's bound.
const vacancyEnvironment = (snapshot, config) => {
  let description = tellsCurrency(snapshot.title, config)
    ? snapshot.title
    : snapshot.description;
  if (description.length > 6000) {
    description = [
      ...new Set(
        [
          ...salaryCurrencies(description, config),
          ...(unknownSalaryCurrency(description, config)
            ? recognizedSalaryCurrencies(description)
            : []),
        ].map((entry) => entry.code)
      ),
    ].join(' ');
  }
  return {
    pay: snapshot.salary ?? '',
    description,
    evidence: `browser-vacancy:${snapshot.url}`,
  };
};

const vacancyTarget = (target, observed, planning) => {
  if (
    target.source !== 'hh' ||
    observed.question.outgoing ||
    observed.hasDraft ||
    observed.noticeContext?.canReply !== true ||
    planning.vacancy.pay ||
    planning.vacancy.description
  ) {
    return null;
  }
  const url = noticeVacancyUrl({ href: observed.noticeContext.vacancyUrl });
  return url ? assignmentVacancyUrl(url) : null;
};

/** Prefer the observed card; read its page only when currency changes pay. */
export const createBrowserAnswerPlanning = ({ store, readVacancy, signal }) => {
  let tail = Promise.resolve();
  return async (input, observed, target, options = {}) => {
    const planning = browserAnswerPlanning(input, observed);
    // A derived page belongs to its observed vacancy, never to the next chat.
    if (planning.vacancy.evidence.startsWith('browser-vacancy:')) {
      planning.vacancy = { pay: '', description: '', evidence: '' };
    }
    const url = vacancyTarget(target, observed, planning);
    if (!url) {
      return planning;
    }
    const request = browserQuestionInput(target, observed, {
      ...input,
      ...planning,
      modelDraft: false,
    });
    const plan = await previewAnswer(store, request);
    if (!dependsOnCurrency(plan)) {
      return planning;
    }
    const { context } = await prepareAnswerPreview(store, request);
    const card = observed.noticeContext.vacancy;
    if (
      context.salary?.enabled &&
      typeof card === 'string' &&
      card.length <= 600 &&
      tellsCurrency(card, context.salary)
    ) {
      return {
        ...planning,
        vacancy: {
          pay: '',
          description: card,
          evidence: `browser-vacancy:${url}#card`,
        },
      };
    }
    if (
      !readVacancy ||
      !context.salary?.enabled ||
      context.salary.currencies.every(({ code }) => {
        const other = planAnswer(request.question, {
          ...context,
          vacancy: { pay: code, description: '', evidence: '' },
        });
        return other.text === plan.text && other.complete === plan.complete;
      })
    ) {
      return planning;
    }
    const active = globalThis.AbortSignal.any(
      [signal, options.signal].filter(Boolean)
    );
    const work = tail.then(async () => {
      active.throwIfAborted();
      const snapshot = await vacancySnapshot(
        store,
        readVacancy,
        url,
        false,
        active,
        { browserSlot: 'question-vacancy', useCase: 'messages' }
      );
      active.throwIfAborted();
      return {
        ...planning,
        vacancy: vacancyEnvironment(snapshot, context.salary),
      };
    });
    tail = work.catch(() => {});
    return work;
  };
};
