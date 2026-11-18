import { jobsFailure } from './options.js';

export const applicationConfirmationSteps = [
  'answers',
  'cover-letter',
  'send',
  'popup',
];
const fail = () => {
  throw jobsFailure(
    'application-input',
    'Choose distinct application confirmation steps.'
  );
};

/** Canonical choices are frozen in the same signature as the reviewed letter. */
export const applicationConfirmations = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.length > 4 ||
    new Set(value).size !== value.length ||
    value.some((step) => !applicationConfirmationSteps.includes(step))
  ) {
    fail();
  }
  return applicationConfirmationSteps.filter((step) => value.includes(step));
};
export const applicationConfirmationPolicy = (options) =>
  options.supervised
    ? [...applicationConfirmationSteps]
    : [...(options.confirmations ?? ['send'])];

const pendingReview = (receipt) =>
  receipt.active &&
  receipt.state === 'review' &&
  !receipt.hold &&
  !receipt.paused &&
  !receipt.attempted.submit &&
  receipt.delivery === 'none';

export const applicationContinuationData = (value, receipt) => {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    !value ||
    ![...applicationConfirmationSteps, 'missing-answers', 'complete'].includes(
      value.step
    ) ||
    typeof value.confirmationRequired !== 'boolean' ||
    (!applicationConfirmationSteps.includes(value.step) &&
      value.confirmationRequired)
  ) {
    fail();
  }
  if (
    receipt &&
    (value.step === 'complete'
      ? receipt.delivery !== 'provider-confirmed'
      : !pendingReview(receipt))
  ) {
    fail();
  }
  return { step: value.step, confirmationRequired: value.confirmationRequired };
};
