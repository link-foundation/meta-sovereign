/** Private snapshot operations require an actual acknowledgement, including reads. */
export const experienceReply = (value) => {
  if (!value || value.error || value.ok === false || value.httpStatus >= 400) {
    throw new Error('Experience snapshot operation was not acknowledged.');
  }
  return value;
};
export const createExperienceApi = ({ get, report }) => ({
  cvFormalReportPreview: async (input) =>
    experienceReply(
      await get(
        `/api/cv/experience/report-preview?${new URLSearchParams(input)}`
      )
    ),
  ...Object.fromEntries(
    ['start', 'stop', 'status'].map((operation) => [
      `cvFormalReport${operation[0].toUpperCase()}${operation.slice(1)}`,
      async (input) =>
        experienceReply(
          await (operation === 'status'
            ? get(
                `/api/cv/experience/report-status?${new URLSearchParams(input)}`
              )
            : report(`/api/cv/experience/report-${operation}`, input))
        ),
    ])
  ),
  ...Object.fromEntries(
    ['start', 'stop', 'status'].map((operation) => [
      `cvExperiencePlan${operation[0].toUpperCase()}${operation.slice(1)}`,
      async (input) =>
        experienceReply(
          await (operation === 'status'
            ? get(
                `/api/cv/experience/plan-status?${new URLSearchParams(input)}`
              )
            : report(`/api/cv/experience/plan-${operation}`, input))
        ),
    ])
  ),
  ...Object.fromEntries(
    ['start', 'stop', 'status', 'evidence'].map((operation) => [
      `cvLinkedinExperience${operation[0].toUpperCase()}${operation.slice(1)}`,
      async (input) =>
        experienceReply(
          await (['start', 'stop'].includes(operation)
            ? report(`/api/cv/experience/linkedin-${operation}`, input)
            : get(
                `/api/cv/experience/linkedin-${operation}?${new URLSearchParams(input)}`
              ))
        ),
    ])
  ),
  cvExperienceStored: async () =>
    experienceReply(await get('/api/cv/experience/stored')),
  cvExperienceExports: async () =>
    experienceReply(await get('/api/vacancies/resume-exports-stored')),
  cvExperienceDocument: async (revision) =>
    experienceReply(
      await get(
        `/api/cv/experience/document?${new URLSearchParams({ revision })}`
      )
    ),
  ...Object.fromEntries(
    ['import', 'from-hh', 'compare'].map((operation) => [
      {
        import: 'cvExperienceImport',
        'from-hh': 'cvExperienceFromHh',
        compare: 'cvExperienceCompare',
      }[operation],
      async (input) =>
        experienceReply(await report(`/api/cv/experience/${operation}`, input)),
    ])
  ),
});
