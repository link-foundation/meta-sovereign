import {
  assignmentText,
  assignmentVacancyUrl,
} from '../assignments/validation.js';
import { jobsObject, jobsFailure } from './options.js';
import { vacancyChoiceResult, vacancyChoiceSlot } from './vacancy-choice.js';

const fail = () => {
  throw jobsFailure(
    'selection-unconfirmed',
    'Vacancy selection was not confirmed.'
  );
};
const fold = (text) =>
  text.normalize('NFKC').toLowerCase().replaceAll('ё', 'е');

/** Literal substrings only; no regular expressions or inferred provider outcomes. */
export const vacancySelectionOptions = (input = {}) => {
  jobsObject(input);
  if (
    input.skipResponded !== undefined &&
    typeof input.skipResponded !== 'boolean'
  ) {
    fail();
  }
  const text = assignmentText(
    input.excludeText ?? '',
    4000,
    'excluded text',
    true
  );
  const terms = [
    ...new Set(
      text
        .split(/\r?\n/u)
        .map((term) => term.trim())
        .filter(Boolean)
    ),
  ];
  if (terms.length > 32 || terms.some((term) => term.length > 120)) {
    fail();
  }
  return { skipResponded: input.skipResponded ?? true, excludeText: terms };
};

export const vacancySelectionDecision = (card, choices, cached, filters) => {
  const base = {
    url: assignmentVacancyUrl(card.url),
    term: null,
    field: null,
    descriptionCapturedAt: null,
  };
  const owner = choices.entries.find((row) => row.url === base.url);
  if (owner) {
    return { ...base, reason: `owner-${owner.state}` };
  }
  if (filters.skipResponded && card.responded) {
    return { ...base, reason: 'responded' };
  }
  const description = cached.find((row) => row.url === base.url);
  for (const field of ['title', 'company', 'description']) {
    const source =
      field === 'description' ? description?.description : card[field];
    if (!source) {
      continue;
    }
    const normalized = fold(source);
    const term = filters.excludeText.find((value) =>
      normalized.includes(fold(value))
    );
    if (term) {
      return {
        ...base,
        reason: 'configured-text',
        term,
        field,
        descriptionCapturedAt:
          field === 'description' ? description.capturedAt : null,
      };
    }
  }
  return {
    ...base,
    reason:
      filters.excludeText.length && !description
        ? 'needs-description'
        : 'review',
  };
};

const validateDescriptionDate = (row) => {
  if (row.field === 'description') {
    if (
      typeof row.descriptionCapturedAt !== 'string' ||
      !Number.isFinite(Date.parse(row.descriptionCapturedAt))
    ) {
      fail();
    }
  } else if (row.descriptionCapturedAt !== null) {
    fail();
  }
};

const validateMatch = (row, card, filters, choiceRevision) => {
  if (row.reason === 'configured-text') {
    if (
      !filters.excludeText.includes(row.term) ||
      !['title', 'company', 'description'].includes(row.field) ||
      (row.field !== 'description' &&
        !fold(card[row.field]).includes(fold(row.term)))
    ) {
      fail();
    }
  } else if (row.term !== null || row.field !== null) {
    fail();
  }
  validateDescriptionDate(row);
  if (
    (row.reason === 'needs-description' && !filters.excludeText.length) ||
    (row.reason.startsWith('owner-') && choiceRevision === 'empty')
  ) {
    fail();
  }
};

/** Validate one bound decision per card without treating selection as delivery. */
export const vacancySelectionResult = (raw, result, input) => {
  const browserSlot = vacancyChoiceSlot(input);
  const filters = vacancySelectionOptions(input);
  if (
    !raw ||
    raw.version !== 1 ||
    raw.browserSlot !== browserSlot ||
    raw.filters?.skipResponded !== filters.skipResponded ||
    JSON.stringify(raw.filters?.excludeText) !==
      JSON.stringify(filters.excludeText) ||
    !Array.isArray(raw.decisions) ||
    raw.decisions.length !== result.cards.length
  ) {
    fail();
  }
  const choiceRevision = vacancyChoiceResult(
    { version: 1, browserSlot, revision: raw.choiceRevision, entries: [] },
    input
  ).revision;
  const decisions = raw.decisions.map((row, index) => {
    const card = result.cards[index];
    if (
      !row ||
      row.url !== card.url ||
      ![
        'owner-skipped',
        'owner-deferred',
        'responded',
        'configured-text',
        'needs-description',
        'retry-wait',
        'review',
      ].includes(row.reason) ||
      (filters.skipResponded &&
        card.responded &&
        !['owner-skipped', 'owner-deferred', 'responded'].includes(
          row.reason
        )) ||
      (row.reason === 'responded' &&
        (!filters.skipResponded || !card.responded))
    ) {
      fail();
    }
    validateMatch(row, card, filters, choiceRevision);
    return {
      url: row.url,
      reason: row.reason,
      term: row.term,
      field: row.field,
      descriptionCapturedAt: row.descriptionCapturedAt,
    };
  });
  return { version: 1, browserSlot, choiceRevision, filters, decisions };
};
