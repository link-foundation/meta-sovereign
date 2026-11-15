import { positiveVkId } from '../automation/vk-friends-settings.js';
import {
  vkNativeAttachment,
  vkNativeAttachments,
} from './vk-native-attachment.js';

const incomplete = () => {
  throw new Error('Incomplete VK wall invitation evidence');
};
const attachmentsEvidence = (attachments = []) => {
  if (
    !Array.isArray(attachments) ||
    attachments.length > 100 ||
    JSON.stringify(attachments).length > 50000
  ) {
    incomplete();
  }
  return attachments;
};
const postEvidence = (post, community) => {
  if (
    !positiveVkId(post?.id) ||
    post.owner_id !== -community ||
    !Number.isSafeInteger(post.from_id) ||
    !post.from_id ||
    typeof post.text !== 'string' ||
    !Number.isSafeInteger(post.date) ||
    post.date <= 0 ||
    ![undefined, false, true, 0, 1].includes(post.can_delete)
  ) {
    incomplete();
  }
  return {
    id: post.id,
    ownerId: post.owner_id,
    fromId: post.from_id,
    text: post.text,
    date: post.date,
    canDelete: Boolean(post.can_delete),
    // Retain the provider's bounded attachment representation for exact review.
    attachments: attachmentsEvidence(post.attachments),
  };
};
const pageEvidence = (page, community, count) => {
  if (
    !Number.isInteger(page?.count) ||
    page.count < 0 ||
    !Array.isArray(page.items) ||
    page.items.length > count ||
    page.items.length > page.count
  ) {
    incomplete();
  }
  return page.items.map((post) => postEvidence(post, community));
};
const avatarReference = (profile) => {
  if (
    typeof profile.photo_id === 'string' &&
    vkNativeAttachment(`photo${profile.photo_id}`)
  ) {
    return `photo${profile.photo_id}`;
  }
  const photo = profile.crop_photo?.photo;
  const value = `photo${photo?.owner_id}_${photo?.id}${photo?.access_key ? `_${photo.access_key}` : ''}`;
  return vkNativeAttachment(value) ? value : null;
};
const activeAvatar = async (call, profile, token) => {
  const reference = avatarReference(profile);
  if (!reference || reference.split('_').length > 2) {
    return reference;
  }
  let photos;
  try {
    photos = await call(
      'photos.getById',
      { photos: reference.slice(5), extended: 0 },
      token
    );
  } catch {
    // An optional access-key lookup cannot require reuploading the avatar.
    // Keep the exact native photo ID; VK still decides whether it is usable.
    return reference;
  }
  if (!Array.isArray(photos) || photos.length !== 1) {
    incomplete();
  }
  const photo = photos[0];
  if (`photo${photo.owner_id}_${photo.id}` !== reference) {
    incomplete();
  }
  const withKey = `${reference}${photo.access_key ? `_${photo.access_key}` : ''}`;
  return vkNativeAttachment(withKey) ? withKey : incomplete();
};

const wallIdentity = async (call, options) => {
  const profiles = await call(
    'users.get',
    { fields: options.activeAvatar ? 'photo_id,crop_photo' : '' },
    options.token
  );
  if (
    !Array.isArray(profiles) ||
    profiles.length !== 1 ||
    !positiveVkId(profiles[0]?.id) ||
    profiles[0].deactivated
  ) {
    incomplete();
  }
  return profiles[0];
};

/** Invitation writes have no automatic retry; admission runs after rate wait. */
export const createVkWall = ({ call, once }) => {
  const search = async (community, options) => {
    const posts = [];
    let total;
    do {
      const page = await call(
        'wall.search',
        {
          owner_id: -community,
          query: options.marker,
          count: 100,
          offset: posts.length,
        },
        options.token
      );
      const items = pageEvidence(page, community, 100);
      total ??= page.count;
      if (
        total > 1000 ||
        total !== page.count ||
        (!items.length && posts.length < total)
      ) {
        incomplete();
      }
      posts.push(...items);
    } while (posts.length < total);
    if (
      posts.length !== total ||
      new Set(posts.map((p) => p.id)).size !== total
    ) {
      incomplete();
    }
    return posts;
  };
  return {
    async wallInviteSnapshot(options) {
      return { accountId: (await wallIdentity(call, options)).id };
    },
    async wallInviteState(community, options) {
      if (!positiveVkId(community)) {
        incomplete();
      }
      const profile = await wallIdentity(call, options);
      const page = await call(
        'wall.get',
        { owner_id: -community, count: 10, filter: 'all' },
        options.token
      );
      const top = pageEvidence(page, community, 10);
      if (
        top.length !== Math.min(10, page.count) ||
        new Set(top.map((p) => p.id)).size !== top.length
      ) {
        incomplete();
      }
      return {
        accountId: profile.id,
        community,
        top,
        owned: options.replaceOwned
          ? (await search(community, options)).filter(
              (p) =>
                p.fromId === profile.id &&
                p.canDelete &&
                p.text.includes(options.marker)
            )
          : [],
        avatar: options.activeAvatar
          ? await activeAvatar(call, profile, options.token)
          : null,
      };
    },
    async wallInvitePostState(community, postId, options) {
      const raw = await call(
        'wall.getById',
        { posts: `${-community}_${postId}` },
        options.token
      );
      const posts = Array.isArray(raw) ? raw : raw?.items;
      if (!Array.isArray(posts) || posts.length !== 1) {
        incomplete();
      }
      const result = postEvidence(posts[0], community);
      if (result.id !== postId) {
        incomplete();
      }
      return result;
    },
    async wallInviteEffect(step, options, beforeIssue) {
      const deleting = step.action === 'delete';
      if (
        !['post', 'delete'].includes(step.action) ||
        !positiveVkId(step.community) ||
        (deleting
          ? !positiveVkId(step.postId)
          : typeof step.text !== 'string' ||
            !step.text.trim() ||
            typeof step.guid !== 'string' ||
            !/^[a-zA-Z0-9-]{1,80}$/u.test(step.guid))
      ) {
        incomplete();
      }
      const params = deleting
        ? { post_id: step.postId }
        : {
            message: step.text,
            attachments: vkNativeAttachments(step.attachments).join(','),
            guid: step.guid,
            from_group: 0,
          };
      const raw = await once(
        `wall.${deleting ? 'delete' : 'post'}`,
        {
          owner_id: -step.community,
          ...params,
        },
        options.token,
        { write: true, retries: 0 },
        beforeIssue
      );
      if (deleting ? raw !== 1 : !positiveVkId(raw?.post_id)) {
        throw Object.assign(
          new Error('VK did not acknowledge the wall action'),
          { ambiguous: true, code: 'unconfirmed' }
        );
      }
      return {
        confirmed: true,
        ...(deleting
          ? { deleted: true, postId: step.postId }
          : { postId: raw.post_id }),
      };
    },
  };
};
