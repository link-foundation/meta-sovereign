/** A pasted URL owns its filters; a separately selected résumé may replace it. */
export const vacancySearchInput = (values, page) => ({
  ...(values.searchUrl
    ? {
        url: values.searchUrl,
        resume: values.resume || undefined,
        browserSlot: values.browserSlot,
        resumeLanguage: values.resumeLanguage,
        skipResponded: values.skipResponded,
        excludeText: values.excludeText,
      }
    : {
        ...values,
        salary: values.salary === '' ? undefined : Number(values.salary),
      }),
  page,
  headless: values.mode === 'inherit' ? undefined : values.mode === 'headless',
});

export const vacancyUrlFilterDisabled = (values, key) =>
  Boolean(values.searchUrl) &&
  ['query', 'area', 'salary', 'currency', 'order', 'remote'].includes(key);
