export const CONVERSATION_SETTINGS_ID = 'conversation-learning:settings';
export const DEFAULT_CONVERSATION_SETTINGS = Object.freeze({
  enabled: true,
  facts: true,
  questions: true,
  suggestions: true,
});
export const conversationSettings = (given = {}) =>
  Object.fromEntries(
    Object.entries(DEFAULT_CONVERSATION_SETTINGS).map(([key, fallback]) => [
      key,
      typeof given[key] === 'boolean' ? given[key] : fallback,
    ])
  );

const QUERY = {
  enabled: 'learning',
  facts: 'facts',
  questions: 'questions',
  suggestions: 'context',
};
export const requestedConversationSettings = (params) =>
  Object.fromEntries(
    Object.entries(QUERY).map(([key, query]) => [
      key,
      params.get(query) !== '0',
    ])
  );
export const conversationQuery = (settings = {}) =>
  Object.fromEntries(
    Object.entries(QUERY)
      .filter(([key]) => settings[key] === false)
      .map(([, query]) => [query, '0'])
  );
