/** Company/time comparison preserves original fields; it never authorizes a write. */
const fail = () => {
  throw Object.assign(
    new Error('The experience snapshots were not confirmed.'),
    {
      code: 'cv-experience-input',
    }
  );
};
const cyrillic = Object.fromEntries(
  [...'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'].map((letter, index) => [
    letter,
    [
      'a',
      'b',
      'v',
      'g',
      'd',
      'e',
      'e',
      'zh',
      'z',
      'i',
      'i',
      'k',
      'l',
      'm',
      'n',
      'o',
      'p',
      'r',
      's',
      't',
      'u',
      'f',
      'kh',
      'ts',
      'ch',
      'sh',
      'shch',
      '',
      'y',
      '',
      'e',
      'yu',
      'ya',
    ][index],
  ])
);
const legalForms = new Set([
  'ooo',
  'zao',
  'oao',
  'pao',
  'ao',
  'llc',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'corp',
  'corporation',
]);
export const experienceCompanyKey = (value) => {
  if (typeof value !== 'string' || value.length > 500) {
    fail();
  }
  const tokens =
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/\p{M}/gu, '')
      .replace(/[а-яё]/gu, (letter) => cyrillic[letter])
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  while (legalForms.has(tokens[0])) {
    tokens.shift();
  }
  while (legalForms.has(tokens.at(-1))) {
    tokens.pop();
  }
  return tokens.join('');
};
const month = (value, end = false) => {
  if (
    typeof value !== 'string' ||
    !/^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2]))?$/u.test(value)
  ) {
    return null;
  }
  const [year, part] = value.split('-').map(Number);
  return year * 12 + (part ?? (end ? 12 : 1));
};
const cloneArray = (value, budget, depth) => {
  if (value.length <= 500) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
      fail();
    }
    return Array.from({ length: value.length }, (_unused, index) => {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        fail();
      }
      return cloneData(descriptor.value, budget, depth + 1);
    });
  }
  fail();
};
const cloneObject = (value, budget, depth) => {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    fail();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length > 64 ||
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        key.length > 100 ||
        !Object.hasOwn(descriptors[key], 'value')
    )
  ) {
    fail();
  }
  return Object.fromEntries(
    keys.map((key) => [
      key,
      cloneData(descriptors[key].value, budget, depth + 1),
    ])
  );
};
const cloneData = (value, budget, depth = 0) => {
  if (--budget.nodes < 0 || depth > 8) {
    fail();
  }
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (
    typeof value === 'string' &&
    value.length <= 24000 &&
    !value.includes('\0')
  ) {
    budget.characters -= value.length;
    if (budget.characters < 0) {
      fail();
    }
    return value;
  }
  return Array.isArray(value)
    ? cloneArray(value, budget, depth)
    : cloneObject(value, budget, depth);
};
const validateDates = (copy) => {
  for (const field of ['start', 'end']) {
    if (
      copy[field] !== undefined &&
      copy[field] !== null &&
      month(copy[field]) === null
    ) {
      fail();
    }
  }
  if (
    (copy.current !== undefined && typeof copy.current !== 'boolean') ||
    (copy.current && copy.end !== undefined && copy.end !== null) ||
    (copy.start && copy.end && month(copy.end, true) < month(copy.start))
  ) {
    fail();
  }
};
const snapshotJobs = (value, budget) => {
  if (!Array.isArray(value) || value.length > 200) {
    fail();
  }
  return cloneData(value, budget).map((copy) => {
    if (
      !copy ||
      Array.isArray(copy) ||
      typeof copy.company !== 'string' ||
      !copy.company.trim() ||
      copy.company.length > 500
    ) {
      fail();
    }
    for (const field of ['title', 'location', 'description']) {
      if (copy[field] !== undefined && typeof copy[field] !== 'string') {
        fail();
      }
    }
    validateDates(copy);
    return copy;
  });
};
/** Detached bounded JSON for private structured experience documents. */
export const copyExperienceData = (value) =>
  cloneData(value, { nodes: 16000, characters: 2 * 1024 * 1024 });
export const validateExperienceJobs = (value) =>
  snapshotJobs(value, { nodes: 16000, characters: 2 * 1024 * 1024 });
const companyAliases = (groups) => {
  if (!Array.isArray(groups) || groups.length > 100) {
    fail();
  }
  const aliases = new Map();
  for (const group of groups) {
    if (!Array.isArray(group) || group.length < 2 || group.length > 10) {
      fail();
    }
    const keys = [...new Set(group.map(experienceCompanyKey))].sort();
    if (keys.some((key) => !key || aliases.has(key))) {
      fail();
    }
    for (const key of keys) {
      aliases.set(key, keys[0]);
    }
  }
  return aliases;
};
const period = (job, asOf) => {
  const start = month(job.start);
  const end = job.current ? month(asOf) : month(job.end, true);
  return start !== null && end !== null && end >= start ? [start, end] : null;
};
const overlaps = (a, b) => a && b && a[0] <= b[1] && b[0] <= a[1];
const stable = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
        )
      : item
  );
const comparable = (field, value) => {
  if (
    field === 'skills' &&
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string')
  ) {
    return stable(
      [...new Set(value.map((item) => item.toLowerCase().trim()))].sort()
    );
  }
  if (
    field === 'industries' &&
    Array.isArray(value) &&
    value.every((item) => typeof item?.id === 'string')
  ) {
    return stable([...new Set(value.map((item) => item.id))].sort());
  }
  return stable(value);
};
const differentLanguages = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  /\p{Script=Cyrillic}/u.test(a) !== /\p{Script=Cyrillic}/u.test(b) &&
  /\p{L}/u.test(a) &&
  /\p{L}/u.test(b);
export const experienceDifferences = (left, right) =>
  [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .sort()
    .filter(
      (field) =>
        comparable(field, left[field]) !== comparable(field, right[field])
    )
    .map((field) => ({
      field,
      left: left[field] ?? null,
      right: right[field] ?? null,
      requiresTranslation:
        ['title', 'description', 'location'].includes(field) &&
        differentLanguages(left[field], right[field]),
    }));
const mutualSingletons = (candidates, reverse) =>
  candidates.flatMap((list, left) =>
    list.length === 1 && reverse[list[0]].length === 1 ? [[left, list[0]]] : []
  );

/** Ambiguous same-employer overlaps remain review items rather than guessed pairs. */
export const compareExperience = (leftInput, rightInput, options = {}) => {
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 7);
  if (month(asOf) === null || asOf.length !== 7) {
    fail();
  }
  const budget = { nodes: 16000, characters: 2 * 1024 ** 2 };
  const left = snapshotJobs(leftInput, budget);
  const right = snapshotJobs(rightInput, budget);
  const aliases = companyAliases(options.companyAliases ?? []);
  const key = (job) => {
    const normalized = experienceCompanyKey(job.company);
    return aliases.get(normalized) ?? normalized;
  };
  const leftKeys = left.map(key);
  const rightKeys = right.map(key);
  const leftPeriods = left.map((job) => period(job, asOf));
  const rightPeriods = right.map((job) => period(job, asOf));
  const sameCompany = leftKeys.map((a) =>
    rightKeys.flatMap((b, index) => (a && a === b ? [index] : []))
  );
  const candidates = sameCompany.map((list, index) =>
    list.filter((target) => overlaps(leftPeriods[index], rightPeriods[target]))
  );
  const reverse = right.map((_job, index) =>
    candidates.flatMap((list, source) => (list.includes(index) ? [source] : []))
  );
  const unknownLeft = left.map(
    (_job, index) =>
      !leftPeriods[index] ||
      sameCompany[index].some((target) => !rightPeriods[target])
  );
  const unknownRight = right.map(
    (_job, index) =>
      !rightPeriods[index] ||
      sameCompany.some(
        (list, source) => list.includes(index) && !leftPeriods[source]
      )
  );
  const pairs = mutualSingletons(candidates, reverse).filter(
    ([a, b]) => !unknownLeft[a] && !unknownRight[b]
  );
  const matchedLeft = new Set(pairs.map(([index]) => index));
  const matchedRight = new Set(pairs.map(([, index]) => index));
  const review = [];
  const oneSided = (jobs, lists, unknown, matched, side) =>
    jobs.flatMap((job, index) => {
      if (matched.has(index)) {
        return [];
      }
      if (lists[index].length || unknown[index]) {
        review.push({
          side,
          index,
          job,
          candidates: lists[index],
          reason: unknown[index] ? 'unknown-period' : 'ambiguous',
        });
        return [];
      }
      return [{ index, job }];
    });
  const onlyLeft = oneSided(left, candidates, unknownLeft, matchedLeft, 'hh');
  const onlyRight = oneSided(
    right,
    reverse,
    unknownRight,
    matchedRight,
    'linkedin'
  );
  return {
    version: 1,
    status: 'compared',
    asOf,
    pairs: pairs.map(([a, b]) => ({
      leftIndex: a,
      rightIndex: b,
      left: left[a],
      right: right[b],
      differences: experienceDifferences(left[a], right[b]),
    })),
    onlyLeft,
    onlyRight,
    review,
  };
};

/** Other platform comparisons retain their existing result without a fabricated pair. */
const compareEntries = (entries, options) => {
  const sides = ['hh', 'linkedin'].map((id) =>
    entries.filter((entry) => entry.platform === id)
  );
  if (sides.some((side) => side.length > 1)) {
    fail();
  }
  return sides.every((side) => side.length === 1)
    ? compareExperience(
        sides[0][0].cv?.experience ?? [],
        sides[1][0].cv?.experience ?? [],
        options
      )
    : null;
};

/** A legacy snapshot with an unparseable date must not break the field matrix. */
export const compareCvExperience = (entries, options) => {
  try {
    return compareEntries(entries, options);
  } catch (error) {
    if (error.code !== 'cv-experience-input') {
      throw error;
    }
    return { version: 1, status: 'unavailable', code: error.code };
  }
};
