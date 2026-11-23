import { browserName } from '../browser/policy.js';
import { assignmentFailure } from '../assignments/validation.js';
import {
  assignmentFormUrl,
  recognizeFormAssignment,
} from './assignment-recognition.js';
import {
  currentFormAssignment,
  rememberFormAssignment,
} from './assignment-store.js';

const missing = () =>
  assignmentFailure(
    'review-missing',
    'Open a Forms review with visible assignment instructions, then try again.'
  );
const changed = () =>
  assignmentFailure(
    'review-changed',
    'Read and plan the current Forms review before drafting.'
  );

const selectedSessions = (reviews, { reviewId, reviewSlot }) => {
  if (reviewId !== undefined) {
    if (
      reviewSlot !== undefined ||
      typeof reviewId !== 'string' ||
      !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(reviewId)
    ) {
      throw assignmentFailure(
        'input',
        'Choose one valid Forms review ID or slot.'
      );
    }
  } else if (reviewSlot !== null) {
    browserName(reviewSlot);
  }
  return reviews
    .list()
    .sessions.filter(
      (session) =>
        session.state === 'open' &&
        (reviewId === undefined || session.id === reviewId) &&
        (reviewSlot === undefined ||
          reviewSlot === null ||
          session.browserSlot === reviewSlot)
    );
};

const findAssignmentInspection = async (reviews, sessions, prior, signal) => {
  let selected;
  for (const { id } of sessions) {
    signal.throwIfAborted();
    const inspection = await reviews.snapshot(id, signal);
    if (
      inspection.challenge?.active ||
      (!prior && !(await recognizeFormAssignment(inspection))?.fingerprint)
    ) {
      continue;
    }
    if (selected) {
      throw assignmentFailure(
        'review-ambiguous',
        'Several open Forms reviews contain assignments. Choose a slot.'
      );
    }
    selected = inspection;
  }
  return selected;
};

const assertSameAssignment = async (prior, inspection, revision) => {
  if (
    revision === undefined ||
    assignmentFormUrl(prior.url) !== assignmentFormUrl(inspection.url) ||
    (await recognizeFormAssignment(prior))?.fingerprint !==
      (await recognizeFormAssignment(inspection))?.fingerprint
  ) {
    throw changed();
  }
};

export const activeAssignmentReview =
  (store, reviews) => async (input, operation, signal) => {
    if (input?.reviewSlot === undefined && input?.reviewId === undefined) {
      return input;
    }
    if (input.standalone !== undefined || input.sourceText !== undefined) {
      throw assignmentFailure(
        'input',
        'Choose a Forms review or standalone instructions.'
      );
    }
    const sessions = selectedSessions(reviews, input);
    const inspection = await findAssignmentInspection(
      reviews,
      sessions,
      input.inspection,
      signal
    );
    signal.throwIfAborted();
    if (!inspection) {
      throw input.inspection ? changed() : missing();
    }
    if (input.inspection) {
      await assertSameAssignment(input.inspection, inspection, input.revision);
    }
    if (input.revision !== undefined) {
      return { ...input, inspection };
    }
    const assignment =
      operation === 'draft'
        ? await rememberFormAssignment(store, inspection)
        : await currentFormAssignment(store, inspection);
    signal.throwIfAborted();
    return { ...input, inspection, revision: assignment?.revision };
  };
