// Browser inspection must not import the Node-owned timer implementation.
export const vkOutgoingQueues = new WeakMap();
export const inspectVkOutgoingRuntime = (store) =>
  vkOutgoingQueues.get(store)?.inspect() ?? null;
