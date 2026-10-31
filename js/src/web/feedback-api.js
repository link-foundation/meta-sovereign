const query = (value = {}) =>
  new URLSearchParams(
    Object.entries(value).filter(
      ([, item]) => item !== undefined && item !== null && item !== ''
    )
  ).toString();
export const createFeedbackApi = ({ get, report }) => ({
  feedback: (options) => get(`/api/feedback?${query(options)}`),
  feedbackActors: (id, options) =>
    get(`/api/feedback/actors?${query({ id, ...options })}`),
  feedbackPerson: (source, peer, options) =>
    get(`/api/feedback/person?${query({ source, peer, ...options })}`),
  collectFeedback: (id, offset) =>
    report(
      '/api/feedback/collect',
      { id, ...(offset !== undefined ? { offset } : {}) },
      { read: true, network: true }
    ),
  feedbackSettings: () => get('/api/feedback/settings'),
  saveFeedbackSettings: (settings) =>
    report('/api/feedback/settings', settings, { network: true }),
});
