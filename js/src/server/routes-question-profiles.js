import { json, readBody } from './util.js';
import {
  listAnswerProfiles,
  readAnswerProfile,
  saveAnswerProfile,
  deleteAnswerProfile,
} from '../automation/question-profiles.js';

const ROOT = '/api/automations/answers/profiles';
export const questionProfilesRoute = async (store, req, res, path) => {
  if (req.method === 'GET' && path === ROOT) {
    json(res, 200, { profiles: await listAnswerProfiles(store) });
  } else if (req.method === 'POST' && path === `${ROOT}/read`) {
    json(res, 200, {
      profile: await readAnswerProfile(store, (await readBody(req)).id),
    });
  } else if (req.method === 'POST' && path === `${ROOT}/save`) {
    json(res, 200, {
      profile: await saveAnswerProfile(store, await readBody(req)),
    });
  } else if (req.method === 'POST' && path === `${ROOT}/delete`) {
    json(res, 200, await deleteAnswerProfile(store, await readBody(req)));
  } else {
    return false;
  }
  return true;
};
