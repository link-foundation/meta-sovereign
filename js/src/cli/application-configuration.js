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
const applicationBooleanConfiguration = async (
  args,
  name,
  environment,
  { env = process.env, cwd = process.cwd() } = {}
) => {
  const positive = args[name];
  const negative = args[`no-${name}`];
  if (positive !== undefined && negative !== undefined) {
    throw new Error(`Use one --${name} option.`);
  }
  const explicit = positive ?? negative;
  if (
    explicit !== undefined &&
    ![true, false, 'true', 'false'].includes(explicit)
  ) {
    throw new Error(`--${name} must be true or false.`);
  }
  const argv = configurationArgv(args);
  if (explicit !== undefined) {
    const enabled = explicit === true || explicit === 'true';
    argv.push(`--${name}=${negative === undefined ? enabled : !enabled}`);
  }
  const { makeConfig } = await import('lino-arguments');
  const config = makeConfig({
    argv,
    cwd,
    env: { values: env },
    yargs: ({ yargs }) =>
      yargs.option(name, {
        type: 'boolean',
        env: environment,
        default: true,
      }),
  });
  return config[
    name.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
  ];
};

export const applicationSurveyConfiguration = (args, configuration) =>
  applicationBooleanConfiguration(
    args,
    'auto-answer-viewed-vacancy',
    'AUTO_ANSWER_VIEWED_VACANCY',
    configuration
  );

export const applicationRouteConfiguration = (args, configuration) =>
  applicationBooleanConfiguration(
    args,
    'apply-from-vacancy-page',
    'APPLY_FROM_VACANCY_PAGE',
    configuration
  );

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
