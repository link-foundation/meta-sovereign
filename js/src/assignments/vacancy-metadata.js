import { assignmentText } from './validation.js';

/** Optional employer-authored fields; never truncate or infer missing values. */
export const vacancyMetadata = (value) =>
  Object.fromEntries(
    [
      'salary',
      'location',
      'experience',
      'employment',
      'workFormat',
      'published',
    ].map((key) => [
      key,
      assignmentText(
        value[key] === undefined ? '' : value[key],
        1000,
        `vacancy ${key}`,
        true
      ),
    ])
  );
