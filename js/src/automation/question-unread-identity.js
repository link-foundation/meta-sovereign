export const browserUnreadId = (id) =>
  typeof id === 'string' &&
  /^question-unread:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/u.test(
    id
  );

export const unreadFailure = (code, message) =>
  Object.assign(new Error(message), { code, fallback: false });
