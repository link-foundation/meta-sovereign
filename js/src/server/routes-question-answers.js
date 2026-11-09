import { json, readBody } from './util.js';
import {
  listAnswerRules,
  saveAnswerRule,
  deleteAnswerRule,
  previewAnswer,
  learnSavedAnswers,
} from '../automation/question-store.js';

const ROOT = '/api/automations/answers';
export const questionAnswerRoute = async (store, req, res, path) => {
  if (req.method === 'GET' && path === ROOT) {
    json(res, 200, { rules: await listAnswerRules(store) });
  } else if (isSaveRoute(req.method, path)) {
    const body = await readBody(req);
    json(res, 200, { rule: await saveAnswerRule(store, body.rule ?? body) });
  } else if (req.method === 'POST' && path === `${ROOT}/plan`) {
    json(res, 200, await previewAnswer(store, await readBody(req)));
  } else if (req.method === 'POST' && path === `${ROOT}/learn`) {
    json(res, 200, await learnSavedAnswers(store, await readBody(req)));
  } else if (req.method === 'POST' && path === `${ROOT}/delete`) {
    json(res, 200, await deleteAnswerRule(store, (await readBody(req)).id));
  } else if (req.method === 'DELETE' && path.startsWith(`${ROOT}/`)) {
    json(
      res,
      200,
      await deleteAnswerRule(
        store,
        decodeURIComponent(path.slice(ROOT.length + 1))
      )
    );
  } else {
    return false;
  }
  return true;
};

const isSaveRoute = (method, path) =>
  (method === 'PUT' && path === ROOT) ||
  (method === 'POST' && path === `${ROOT}/save`);
