import { acknowledgedRead } from './acknowledged-store.js';
import { applicationFailure as fail } from './application-options.js';
import { discoveryKey, discoveryRecord } from './discovery-data.js';
import { hhSearchUrl } from './options.js';
import { salaryTierFloor } from './salary-ladder.js';

export const discoveryBatchUrls = (discovery) =>
  discovery?.phase === 'completed'
    ? discovery.entries
        .filter(
          ({ decision, pay }) =>
            decision.reason === 'review' && (!pay || pay.action === 'apply')
        )
        .map(({ card }) => card.url)
    : [];

export const discoveryBatchSalary = (discovery) => {
  const options = discovery?.options;
  if (discovery?.phase !== 'completed' || !options.salaryConfig) {
    return {};
  }
  const floor = salaryTierFloor(options, discovery.salaryTier);
  return {
    salary: options.salaryConfig,
    salaryLadder: options.salaryLadder !== false,
    ...(floor === null ? {} : { salaryFloorRub: floor }),
  };
};

export const discoveryBatchCollection = (discovery) => {
  const value = discovery?.options.collectVacancies;
  return discovery?.phase === 'completed' && typeof value === 'boolean'
    ? { collectVacancies: value }
    : {};
};

export const discoveryBatchSettings = (discovery) => ({
  ...discoveryBatchSalary(discovery),
  ...discoveryBatchCollection(discovery),
  ...(discovery?.phase === 'completed'
    ? { applicationSearchUrl: hhSearchUrl(discovery.options.search) }
    : {}),
});

export const discoveryBatchRequestId = (value) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/u.test(value)) {
    throw fail('batch-input');
  }
  return value;
};

export const readDiscoveryBatch = async (store, key, requestId) => {
  const source = discoveryKey({ browserSlot: key.browserSlot, requestId });
  const raw = await acknowledgedRead(store, () => store.get(source.id));
  let discovery;
  try {
    discovery = discoveryRecord(raw, source);
  } catch {
    throw fail('batch-source');
  }
  const urls = discoveryBatchUrls(discovery);
  if (urls.length === 0) {
    throw fail('batch-source');
  }
  return { urls, settings: discoveryBatchSettings(discovery) };
};

export const applyDiscoveryBatch = (input, { urls, settings }) => ({
  ...input,
  ...Object.fromEntries(
    [
      'applicationSearchUrl',
      'collectVacancies',
      'salary',
      'salaryLadder',
      'salaryFloorRub',
    ]
      .filter((key) => input[key] === undefined && settings[key] !== undefined)
      .map((key) => [key, settings[key]])
  ),
  urls,
});
