const approvedSalaryChoice = (part) =>
  part.match === 'salary' &&
  part.strictOptions === true &&
  part.salary?.option?.contained === true &&
  part.salary.option.choice === part.option &&
  part.option === part.text;

/** Automatic choices require complete approved evidence for every pending part. */
const approvedPart = (part) =>
  (part.noReply && !part.linkReview) ||
  (part.complete &&
    !part.requiresReview &&
    (['exact', 'accepted-summary'].includes(part.match) ||
      approvedSalaryChoice(part)));

export const approvedBrowserPlan = (plan) =>
  plan?.complete === true &&
  !plan.linkReview &&
  !plan.pending?.blocked &&
  (approvedPart(plan) ||
    (plan.match === 'pending-turn' && plan.parts.every(approvedPart))) &&
  typeof plan.text === 'string' &&
  Boolean(plan.text.trim());
