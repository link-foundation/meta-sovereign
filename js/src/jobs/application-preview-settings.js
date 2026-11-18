export const validVacancyPreviewSeconds = (value) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 30;

export const vacancyPreviewSeconds = (options) =>
  options.vacancyPreviewSeconds ?? 3;
export const applicationPreviewOptions = (input) =>
  input.vacancyPreviewSeconds === undefined
    ? {}
    : { vacancyPreviewSeconds: input.vacancyPreviewSeconds };
