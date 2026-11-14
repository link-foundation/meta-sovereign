import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import {
  readAnswerModel,
  saveAnswerModel,
} from '../automation/answer-model-config.js';
import { previewAnswer } from '../automation/question-store.js';

export const answerModelPreviewRoute = async (store, req, res, ctx) => {
  const input = await readBody(req);
  if (input.modelDraft && !isTrustedMutation(req, ctx?.allowOrigins)) {
    json(res, 403, {
      code: 'origin-not-allowed',
      error: 'A trusted origin is required.',
    });
  } else {
    json(
      res,
      200,
      await previewAnswer(store, input, { runner: ctx?.answerModel?.draft })
    );
  }
  return true;
};

export const answerModelRoute = async (store, req, res, ctx = {}) => {
  if (req.method === 'GET') {
    json(res, 200, {
      settings: await readAnswerModel(store),
      available: Boolean(ctx.answerModel?.draft),
    });
  } else if (req.method === 'POST') {
    if (!isTrustedMutation(req, ctx.allowOrigins)) {
      json(res, 403, {
        code: 'origin-not-allowed',
        error: 'A trusted origin is required.',
      });
      return true;
    }
    json(res, 200, {
      settings: await saveAnswerModel(store, await readBody(req)),
    });
  } else {
    return false;
  }
  return true;
};
