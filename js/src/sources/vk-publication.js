import { codedError, contentText, envValue } from './http.js';
import { publicationId, unknownPublication } from './publication-receipt.js';

const ownerOf = (value) => {
  const owner = String(value ?? '');
  if (!/^-?[1-9]\d{0,18}$/.test(owner)) {
    throw codedError(
      'A VK wall owner ID is required; community IDs are negative',
      'bad-target'
    );
  }
  return owner;
};

const identityOf = (state, options) => {
  const ownerId = ownerOf(options.ownerId);
  if (state.tokenType === 'community' && !ownerId.startsWith('-')) {
    throw codedError(
      'A VK community token requires a community wall',
      'auth-config'
    );
  }
  return ownerId;
};

const authorship = (ownerId, content, options) => {
  const community = ownerId.startsWith('-');
  const fromGroup = options.fromGroup ?? content?.fromGroup ?? community;
  const signed = options.signed ?? content?.signed ?? false;
  if ([fromGroup, signed].some((value) => typeof value !== 'boolean')) {
    throw codedError('VK authorship options must be boolean', 'bad-target');
  }
  if ((!community && fromGroup) || (signed && (!community || !fromGroup))) {
    throw codedError(
      'VK community authorship requires a community wall',
      'bad-target'
    );
  }
  return { from_group: fromGroup ? 1 : 0, ...(signed ? { signed: 1 } : {}) };
};

const publicationParams = (ownerId, content, options) => {
  const text = contentText(content);
  if (typeof text !== 'string' || !text.trim()) {
    throw codedError('VK post text is required', 'bad-draft');
  }
  return {
    owner_id: ownerId,
    message: text,
    ...authorship(ownerId, content, options),
    guid:
      options.clientId ?? content?.clientId ?? globalThis.crypto.randomUUID(),
  };
};

// Wall methods are distinct from the existing messages.send adapter. A token's
// actual permission is determined by VK; a local credential check cannot prove it.
export const createVkPublications = ({ call, token, tokenType, ownerId }) => {
  const authStatus = (options = {}) => {
    const kind =
      options.tokenType ?? tokenType ?? envValue('VK_TOKEN_TYPE') ?? 'user';
    if (!['user', 'community'].includes(kind)) {
      throw codedError('Unknown VK token type', 'auth-config');
    }
    return {
      tokenType: kind,
      configured: Boolean(
        options.token ?? token ?? envValue('VK_ACCESS_TOKEN')
      ),
      permissionsVerified: false,
    };
  };
  const target = (content, options) =>
    identityOf(authStatus(options), {
      ownerId:
        options.ownerId ??
        content?.ownerId ??
        ownerId ??
        envValue('VK_OWNER_ID'),
    });
  return {
    authStatus,
    async testConnection(options = {}) {
      const state = authStatus(options);
      const community = state.tokenType === 'community';
      const wall = community ? target(null, options) : null;
      const raw = await call(
        community ? 'groups.getById' : 'users.get',
        community ? { group_id: wall.slice(1) } : {},
        options.token
      );
      const id = publicationId((raw?.groups ?? raw)?.[0]?.id);
      if (!id || (community && id !== wall.slice(1))) {
        throw codedError(
          'VK returned no matching account identity',
          'bad-response'
        );
      }
      return {
        ...state,
        ok: true,
        verified: true,
        identityId: community ? `-${id}` : id,
      };
    },
    async publishPost(content, options = {}) {
      const wall = target(content, options);
      const raw = await call(
        'wall.post',
        publicationParams(wall, content, options),
        options.token
      );
      const postId = publicationId(raw?.post_id);
      if (!postId) {
        throw unknownPublication('VK', 'publication');
      }
      return {
        ok: true,
        ownerId: wall,
        postId,
        id: `${wall}_${postId}`,
        url: `https://vk.com/wall${wall}_${postId}`,
        raw,
      };
    },
    async deletePost(post, options = {}) {
      const wall = target(post, options);
      const postId = publicationId(post?.postId);
      if (!postId) {
        throw codedError('A VK wall post ID is required', 'bad-draft');
      }
      const raw = await call(
        'wall.delete',
        { owner_id: wall, post_id: postId },
        options.token
      );
      if (raw === 0 || raw === false) {
        throw codedError('VK did not delete the post', 'not-deleted');
      }
      if (raw !== 1) {
        throw unknownPublication('VK', 'deletion');
      }
      return { ok: true, deleted: true, ownerId: wall, postId };
    },
  };
};
