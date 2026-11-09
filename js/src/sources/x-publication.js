import { codedError, contentText } from './http.js';
import { unknownPublication } from './publication-receipt.js';

export const createXPublications = ({ request, auth }) => ({
  authStatus: auth.status,

  async testConnection(options = {}) {
    const state = auth.requireUser(options);
    const raw = await request('/2/users/me', {}, options);
    if (!raw?.data?.id) {
      throw codedError('X returned no user identity', 'bad-response');
    }
    return { ...state, ok: true, verified: true, userId: raw.data.id };
  },

  async publishPost(content, options = {}) {
    const text = contentText(content);
    if (!text.trim()) {
      throw codedError('x post text is required', 'bad-draft');
    }
    const raw = await request(
      '/2/tweets',
      { method: 'POST', body: { text } },
      options
    );
    if (typeof raw?.data?.id !== 'string' || !raw.data.id.trim()) {
      throw unknownPublication('X', 'publication');
    }
    return raw;
  },

  async deletePost(post, options = {}) {
    const id = typeof post === 'object' ? post?.id : post;
    if (!/^\d{1,19}$/.test(String(id ?? ''))) {
      throw codedError('An X post ID is required', 'bad-draft');
    }
    const raw = await request(`/2/tweets/${id}`, { method: 'DELETE' }, options);
    if (raw?.data?.deleted === false) {
      throw codedError('X did not delete the post', 'not-deleted');
    }
    if (raw?.data?.deleted !== true) {
      throw unknownPublication('X', 'deletion');
    }
    return raw;
  },
});
