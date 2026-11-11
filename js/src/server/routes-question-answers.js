import { json, readBody } from './util.js';
import { questionProfilesRoute } from './routes-question-profiles.js';
import { questionBrowserRoute } from './routes-question-browser.js';
import {
  answerModelRoute,
  answerModelPreviewRoute,
} from './routes-answer-model.js';
import {
  listAnswerRules,
  saveAnswerRule,
  deleteAnswerRule,
  learnSavedAnswers,
} from '../automation/question-store.js';
import {
  readAnswerPolicy,
  saveAnswerPolicy,
} from '../automation/question-policy.js';
import { salaryExchange } from '../automation/salary-exchange.js';
import {
  extractAnswerProfile,
  listAnswerProfileSources,
} from '../automation/question-profile-source.js';

const ROOT = '/api/automations/answers';
const isProfilesRoute = (path) =>
  path === `${ROOT}/profiles` || path.startsWith(`${ROOT}/profiles/`);
export const questionAnswerRoute = async (store, req, res, path, url, ctx) => {
  if (path === `${ROOT}/browser` || path.startsWith(`${ROOT}/browser/`)) {
    return questionBrowserRoute(req, res, path, ctx);
  }
  if (path === `${ROOT}/model`) {
    return answerModelRoute(store, req, res, ctx);
  }
  if (isProfilesRoute(path)) {
    return questionProfilesRoute(store, req, res, path);
  }
  const handlers = {
    [`${ROOT}/policy`]: policyRoute,
    [`${ROOT}/exchange`]: exchangeRoute,
    [`${ROOT}/profile`]: profileRoute,
    [`${ROOT}/profile-sources`]: profileRoute,
  };
  if (handlers[path]) {
    return handlers[path](store, req, res, path);
  }
  if (req.method === 'GET' && path === ROOT) {
    json(res, 200, { rules: await listAnswerRules(store) });
  } else if (isSaveRoute(req.method, path)) {
    const body = await readBody(req);
    json(res, 200, { rule: await saveAnswerRule(store, body.rule ?? body) });
  } else if (req.method === 'POST' && path === `${ROOT}/plan`) {
    return answerModelPreviewRoute(store, req, res, ctx);
  } else if (req.method === 'POST' && path === `${ROOT}/learn`) {
    json(res, 200, await learnSavedAnswers(store, await readBody(req)));
  } else if (req.method === 'POST' && path === `${ROOT}/delete`) {
    json(res, 200, await deleteAnswerRule(store, (await readBody(req)).id));
  } else if (isDeleteRoute(req.method, path)) {
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

const isDeleteRoute = (method, path) =>
  method === 'DELETE' && path.startsWith(`${ROOT}/`);

const isSaveRoute = (method, path) =>
  (method === 'PUT' && path === ROOT) ||
  (method === 'POST' && path === `${ROOT}/save`);

const exchangeRoute = async (store, req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return false;
  }
  const input = req.method === 'POST' ? await readBody(req) : {};
  json(res, 200, await salaryExchange(store, input));
  return true;
};

const policyRoute = async (store, req, res) => {
  if (req.method === 'GET') {
    json(res, 200, { policy: await readAnswerPolicy(store) });
  } else if (['PUT', 'POST'].includes(req.method)) {
    const body = await readBody(req);
    json(res, 200, {
      policy: await saveAnswerPolicy(store, body.policy ?? body),
    });
  } else {
    return false;
  }
  return true;
};

const profileRoute = async (store, req, res, path) => {
  if (path === `${ROOT}/profile` && req.method === 'POST') {
    json(res, 200, await extractAnswerProfile(store, await readBody(req)));
  } else if (path === `${ROOT}/profile-sources` && req.method === 'GET') {
    json(res, 200, await listAnswerProfileSources(store));
  } else {
    return false;
  }
  return true;
};
