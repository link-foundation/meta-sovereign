// Validate saved/synchronized reports before any UI renders nested evidence.
const text = (value, max = 240) =>
  typeof value === 'string' && value.length <= max;
const array = (value, max, check) =>
  Array.isArray(value) && value.length <= max && value.every(check);
const names = (value, max = 256) =>
  array(value, max, (item) => text(item, 80) && item.length > 0);
const count = (value, max) =>
  Number.isSafeInteger(value) && value >= 0 && value <= max;
const date = (value) => text(value, 40) && Number.isFinite(Date.parse(value));
const frequencies = (value, max) =>
  array(
    value,
    10000,
    (item) => text(item?.value, 2000) && count(item.count, max)
  );
const mention = (item) =>
  Boolean(
    item &&
    text(item.field, 80) &&
    count(item.start, 4 * 1024 * 1024) &&
    count(item.end, 4 * 1024 * 1024) &&
    item.start < item.end &&
    text(item.spelling, 80) &&
    item.spelling.length === item.end - item.start &&
    names(item.candidates) &&
    item.candidates.length > 0 &&
    ['required', 'preferred', 'unspecified'].includes(item.requirement) &&
    text(item.context)
  );
const comparison = (value) =>
  Boolean(
    value &&
    ['mentioned', 'missing', 'requiredMissing', 'preferredMissing'].every(
      (key) => names(value[key])
    ) &&
    array(
      value.aliasSuggestions,
      2000,
      (item) => text(item?.canonical, 80) && text(item.spelling, 80)
    ) &&
    array(
      value.spellingSuggestions,
      100,
      (item) => text(item?.spelling, 500) && names(item.candidates, 8)
    )
  );
export const technologyEvidenceShape = (analysis) => {
  const max = analysis.vacancies.length;
  return (
    text(analysis.resume.title, 500) &&
    date(analysis.resume.capturedAt) &&
    array(analysis.evidence, 5000, mention) &&
    analysis.vacancies.every(
      (row) =>
        array(row.mentions, 2000, mention) &&
        array(row.unrecognizedSkills, 100, (item) => text(item, 200)) &&
        comparison(row.comparison)
    ) &&
    analysis.evidence.length +
      analysis.vacancies.reduce((sum, row) => sum + row.mentions.length, 0) <=
      10000 &&
    analysis.statistics.every(
      (row) =>
        text(row?.canonical, 80) &&
        count(row.vacancies, max) &&
        count(row.required, row.vacancies) &&
        count(row.preferred, row.vacancies) &&
        frequencies(row.spellings, row.vacancies)
    ) &&
    date(analysis.capturedAt) &&
    Object.keys(analysis.metadata ?? {}).length === 4 &&
    ['location', 'employment', 'experience', 'workFormat'].every((key) =>
      frequencies(analysis.metadata?.[key], max)
    )
  );
};
