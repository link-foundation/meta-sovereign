import { positiveVkId } from '../automation/vk-friends-settings.js';
export const invalidDiscovery = () => {
  throw new Error('Incomplete VK discovery evidence');
};
const invalid = invalidDiscovery;
export const discoveryFields = [
  'online',
  'sex',
  'has_photo',
  'can_post',
  'can_see_all_posts',
  'can_write_private_message',
  'can_send_friend_request',
].join(',');
const pageOf = (page, count, objects = false) => {
  if (
    !Number.isSafeInteger(page?.count) ||
    page.count < 0 ||
    !Array.isArray(page.items) ||
    page.items.length > count ||
    page.items.length > page.count ||
    !page.items.every((row) => positiveVkId(objects ? row?.id : row))
  ) {
    invalid();
  }
  return page;
};
export const discoveryProfile = (row) => ({
  deactivated: row.deactivated ?? null,
  online: row.online === 1 || row.online === true,
  sex: row.sex ?? null,
  hasPhoto: row.has_photo === 1 || row.has_photo === true,
  canPost: row.can_post === 1 || row.can_post === true,
  canSee: row.can_see_all_posts === 1 || row.can_see_all_posts === true,
  canWrite:
    row.can_write_private_message === 1 ||
    row.can_write_private_message === true,
  canRequest:
    row.can_send_friend_request === 1 || row.can_send_friend_request === true,
  open: row.is_closed === false,
  accessible: row.can_access_closed === true || row.can_access_closed === 1,
});
const requestFor = (kind, options) =>
  ({
    suggestions: {
      method: 'friends.getSuggestions',
      size: 100,
      objects: true,
      offset: 0,
      params: { filter: 'mutual' },
    },
    community: {
      method: 'groups.getMembers',
      size: 1000,
      objects: false,
      offset: options.offset,
      params: { group_id: options.communityId, sort: 'id_asc' },
    },
    rejections: {
      method: 'friends.getRequests',
      size: 1000,
      objects: false,
      offset: 0,
      params: { out: 0, sort: 1, need_viewed: 1 },
    },
  })[kind];
export const scanDiscovery = async (call, kind, options) => {
  if (kind === 'community' && !positiveVkId(options.communityId)) {
    throw new Error('Configure a source community before discovery');
  }
  const request = requestFor(kind, options);
  if (!request) {
    invalid();
  }
  const items = [];
  let total;
  while (items.length < options.scanLimit) {
    const count = Math.min(request.size, options.scanLimit - items.length);
    const params = {
      ...request.params,
      count,
      offset: items.length + request.offset,
    };
    const page = pageOf(
      await call(request.method, params, options.token),
      count,
      request.objects
    );
    if (total !== undefined && total !== page.count) {
      invalid();
    }
    total = page.count;
    items.push(...page.items.map((row) => (request.objects ? row.id : row)));
    if (items.length + request.offset >= total) {
      break;
    }
    if (!page.items.length) {
      invalid();
    }
  }
  if (new Set(items).size !== items.length) {
    invalid();
  }
  return {
    ids: items,
    total,
    complete: items.length + request.offset >= total,
  };
};
