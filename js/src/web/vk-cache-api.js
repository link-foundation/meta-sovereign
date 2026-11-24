import { inspectVkCache } from '../sources/vk-cache-shape.js';
import { vkCachedReadApi } from './vk-cached-read-api.js';

export const createVkCacheApi = (options) => {
  const api = vkCachedReadApi(options, 'cache', inspectVkCache);
  return {
    inspectVkCache: api.inspect,
    refreshVkCache: api.refresh,
    exportVkCache: api.export,
  };
};
