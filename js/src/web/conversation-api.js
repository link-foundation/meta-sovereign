import {
  CONVERSATION_SETTINGS_ID,
  conversationSettings,
  conversationQuery,
} from '../crm/conversation-policy.js';
import { readConversationSettings } from './conversation-prefs.js';

export const createConversationApi = ({ get, post, saveLocal }) => ({
  conversationSettings: () => get('/api/people/learning-settings'),
  async saveConversationSettings(settings) {
    const policy = conversationSettings(settings);
    await saveLocal({
      id: CONVERSATION_SETTINGS_ID,
      tokens: ['conversation-learning', 'settings'],
      ...policy,
    });
    return post('/api/people/learning-settings', policy, { network: true });
  },
  async peopleLearned(key) {
    if (!key) {
      return null;
    }
    const query = new URLSearchParams({
      key,
      cached: '1',
      ...conversationQuery(readConversationSettings()),
    });
    return get(`/api/people/learned?${query}`).catch(() => null);
  },
});
