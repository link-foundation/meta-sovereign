/** Automatic choices require complete saved evidence for every pending part. */
const approvedPart = (part) =>
  (part.noReply && !part.linkReview) ||
  (part.complete &&
    !part.requiresReview &&
    ['exact', 'accepted-summary'].includes(part.match));

export const approvedBrowserPlan = (plan) =>
  plan?.complete === true &&
  !plan.linkReview &&
  !plan.pending?.blocked &&
  (approvedPart(plan) ||
    (plan.match === 'pending-turn' && plan.parts.every(approvedPart))) &&
  typeof plan.text === 'string' &&
  Boolean(plan.text.trim());
