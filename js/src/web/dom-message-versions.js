import { scopedUrl } from './telegram-account-scope.js';

export const messageVersionCalls = (fetch, ensure) => ({
  editedMessages: (key, { before, count = false } = {}) =>
    fetch(
      `/api/chat/edited?${new URLSearchParams({ key, ...(before ? { before } : {}), ...(count ? { count: '1' } : {}) })}`
    ),
  messageVersions: (id, before) =>
    fetch(
      `/api/chat/versions?${new URLSearchParams({ id, ...(before ? { before } : {}) })}`
    ),
  versionMediaUrl: async (asset) => {
    if (!/^history\/[a-f0-9]{64}\.[a-z0-9]+$/.test(asset?.path ?? '')) {
      return null;
    }
    const { origin } = await ensure();
    return origin
      ? scopedUrl(new URL(`/api/media/${asset.path}`, origin).toString())
      : null;
  },
});
