import { normalizeAnswerFinalPeriod } from '../automation/question-final-period.js';

// Per-command settings do not mutate the process environment or saved policy.
export const questionPeriodConfiguration = async (
  args,
  { env = process.env, cwd = process.cwd() } = {}
) => {
  const argv = ['node', 'meta-sovereign'];
  if (args.configuration !== undefined) {
    if (typeof args.configuration !== 'string' || !args.configuration) {
      throw new Error('--configuration requires a file path.');
    }
    argv.push('--configuration', args.configuration);
  }
  if (args['answer-final-period'] !== undefined) {
    argv.push(
      `--answer-final-period=${normalizeAnswerFinalPeriod(args['answer-final-period'])}`
    );
  }
  const { makeConfig } = await import('lino-arguments');
  const config = makeConfig({
    argv,
    cwd,
    env: { values: env },
    yargs: ({ yargs }) =>
      yargs.option('answer-final-period', {
        type: 'string',
        env: 'ANSWER_FINAL_PERIOD',
      }),
  });
  return config.answerFinalPeriod === undefined
    ? undefined
    : normalizeAnswerFinalPeriod(
        config.answerFinalPeriod.replace(/^(['"`])(with|without)\1$/u, '$2')
      );
};
