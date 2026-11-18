const configurationArgv = (args) => {
  const argv = ['node', 'meta-sovereign'];
  if (args.configuration !== undefined) {
    if (typeof args.configuration !== 'string' || !args.configuration) {
      throw new Error('--configuration requires a file path.');
    }
    argv.push('--configuration', args.configuration);
  }
  return argv;
};

/** Resolve the native survey policy without mutating the host environment. */
export const applicationSurveyConfiguration = async (
  args,
  { env = process.env, cwd = process.cwd() } = {}
) => {
  const positive = args['auto-answer-viewed-vacancy'];
  const negative = args['no-auto-answer-viewed-vacancy'];
  if (positive !== undefined && negative !== undefined) {
    throw new Error('Use one viewed-vacancy survey option.');
  }
  const explicit = positive ?? negative;
  if (
    explicit !== undefined &&
    ![true, false, 'true', 'false'].includes(explicit)
  ) {
    throw new Error('The viewed-vacancy survey option must be true or false.');
  }
  const argv = configurationArgv(args);
  if (explicit !== undefined) {
    const enabled = explicit === true || explicit === 'true';
    argv.push(
      `--auto-answer-viewed-vacancy=${negative === undefined ? enabled : !enabled}`
    );
  }
  const { makeConfig } = await import('lino-arguments');
  const config = makeConfig({
    argv,
    cwd,
    env: { values: env },
    yargs: ({ yargs }) =>
      yargs.option('auto-answer-viewed-vacancy', {
        type: 'boolean',
        env: 'AUTO_ANSWER_VIEWED_VACANCY',
        default: true,
      }),
  });
  return config.autoAnswerViewedVacancy;
};

export const applicationPreviewConfiguration = async (
  args,
  { env = process.env, cwd = process.cwd() } = {}
) => {
  const argv = configurationArgv(args);
  if (args['vacancy-preview-seconds'] !== undefined) {
    argv.push(`--vacancy-preview-seconds=${args['vacancy-preview-seconds']}`);
  }
  const { makeConfig } = await import('lino-arguments');
  const config = makeConfig({
    argv,
    cwd,
    env: { values: env },
    yargs: ({ yargs }) =>
      yargs.option('vacancy-preview-seconds', {
        type: 'number',
        env: 'VACANCY_PREVIEW_SECONDS',
        default: 3,
      }),
  });
  return config.vacancyPreviewSeconds;
};
