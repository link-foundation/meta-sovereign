/** Each registered check belongs to exactly one shard; local runs keep all. */
export const partitionBrowserChecks = (checks, shard = '') => {
  if (
    !Array.isArray(checks) ||
    !checks.length ||
    checks.some(
      (name) => typeof name !== 'string' || !/^[a-z-]+$/u.test(name)
    ) ||
    new Set(checks).size !== checks.length
  ) {
    throw new Error('Browser checks must be a nonempty unique registry.');
  }
  if (!shard) {
    return checks;
  }
  const match = /^([1-9]\d*)\/([1-9]\d*)$/u.exec(shard);
  const [index, count] = match ? match.slice(1).map(Number) : [];
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(count) ||
    index > count ||
    count > checks.length
  ) {
    throw new Error(
      'E2E_SHARD must select a nonempty browser shard: index/count.'
    );
  }
  return checks.filter((_, position) => position % count === index - 1);
};
