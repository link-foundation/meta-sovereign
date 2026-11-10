import {
  readAnswerModel,
  saveAnswerModel,
} from '../automation/answer-model-config.js';
import { createLocalAnswerModel } from '../automation/local-answer-model.js';

export const modelDraftFlag = (value) => {
  if (value !== undefined && ![true, false, 'true', 'false'].includes(value)) {
    throw new Error('--model-draft must be true or false');
  }
  return [true, 'true'].includes(value);
};

export const answerModelCommand = async (args, store) => {
  const action = args._[2] ?? 'show';
  if (action === 'show') {
    return { settings: await readAnswerModel(store) };
  }
  if (
    action !== 'save' ||
    ![true, false, 'true', 'false'].includes(args.enabled)
  ) {
    throw new Error(
      'model expects show | save --enabled=true|false [--model=id] [--cv=cv:id] [--timeout-ms=60000] --revision=<revision|null>'
    );
  }
  if (args.revision === undefined) {
    throw new Error(
      'Use the shown --revision, or --revision=null for initial settings.'
    );
  }
  return {
    settings: await saveAnswerModel(store, {
      enabled: [true, 'true'].includes(args.enabled),
      model: args.model ?? '',
      cvId: args.cv ?? '',
      timeoutMs: Number(args['timeout-ms'] ?? 60000),
      revision: args.revision === 'null' ? null : args.revision,
    }),
  };
};

export const withAnswerModel = async (runner, work) => {
  const service = runner ? null : createLocalAnswerModel();
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    service?.stop().catch(() => {});
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const result = await work(runner ?? service.draft);
    if (cancelled) {
      throw new Error('Draft model command stopped.');
    }
    return result;
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await service?.stop();
  }
};
