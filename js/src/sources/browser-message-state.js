/** Native direction and delivery are separate observations, never send receipts. */
export const browserMessageState = (spec, node) => {
  const matches = (selector) =>
    Boolean(selector) &&
    (node.matches(selector) || Boolean(node.querySelector(selector)));
  const outgoing = matches(spec.outgoing);
  if (!spec.delivery) {
    return { outgoing };
  }
  if (!outgoing) {
    return { outgoing, delivery: null };
  }
  const states = Object.entries(spec.delivery)
    .filter(([, selector]) => matches(selector))
    .map(([state]) => state);
  return {
    outgoing,
    // Conflicting, absent and unfamiliar icons cannot confirm delivery.
    delivery: states.length === 1 ? states[0] : 'unknown',
  };
};

export const browserDeliveryStates = Object.freeze([
  'pending',
  'failed',
  'unknown',
  'sent',
  'delivered',
  'read',
]);
