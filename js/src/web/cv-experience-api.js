/** Private snapshot operations require an actual acknowledgement, including reads. */
export const experienceReply = (value) => {
  if (!value || value.error || value.ok === false || value.httpStatus >= 400) {
    throw Object.assign(
      new Error('Experience snapshot operation was not acknowledged.'),
      { code: value?.code }
    );
  }
  const { httpStatus: _httpStatus, ...receipt } = value;
  return receipt;
};
export const createExperienceApi = ({ get, report }) => ({
  ...Object.fromEntries(
    ['start', 'status', 'stop'].map((operation) => [
      `cvHhAcquisition${operation[0].toUpperCase()}${operation.slice(1)}`,
      async (input) => {
        const route = `/api/cv/experience/hh-${operation}`;
        return experienceReply(
          await (operation === 'status'
            ? get(`${route}?${new URLSearchParams(input)}`)
            : report(route, input, { quiet: true }))
        );
      },
    ])
  ),
  ...Object.fromEntries(
    ['stage', 'stored', 'review', 'start', 'status', 'stop', 'decide'].map(
      (operation) => [
        `cvLinkedinPosition${operation[0].toUpperCase()}${operation.slice(1)}`,
        async (input) => {
          const route = `/api/cv/experience/linkedin-position-${operation}`;
          return experienceReply(
            await (['stored', 'status'].includes(operation)
              ? get(`${route}?${new URLSearchParams(input)}`)
              : report(route, input, { quiet: true }))
          );
        },
      ]
    )
  ),
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
