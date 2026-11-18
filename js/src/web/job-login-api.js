import {
  loginIdentity,
  loginOptions,
  loginResult,
} from '../jobs/login-record.js';
import { jobsFailure } from '../jobs/options.js';

const checked = (value, input) => {
  if (
    [
      'jobs-login-visible',
      'jobs-login-close',
      'jobs-login-conflict',
      'jobs-busy',
      'jobs-stopped',
      'browser-unavailable',
    ].includes(value?.code)
  ) {
    throw Object.assign(new Error('The login operation was refused.'), {
      code: value.code,
    });
  }
  if (!value || !Object.hasOwn(value, 'login')) {
    throw jobsFailure('login-unavailable', 'The login state is not confirmed.');
  }
  return loginResult(value.login, loginIdentity(input));
};
export const createJobLoginApi = ({ get, report }) => ({
  vacancyLoginStatus: async (input = {}) => {
    const identity = loginIdentity(input);
    return checked(
      await get(`/api/vacancies/login-status?${new URLSearchParams(identity)}`),
      identity
    );
  },
  vacancyLoginOpen: async (input) => {
    loginOptions(input);
    const answer = checked(
      await report('/api/vacancies/login-open', input, {
        network: true,
        read: false,
      }),
      input
    );
    if (!answer.login) {
      throw jobsFailure('login-state', 'The login request was not confirmed.');
    }
    return answer;
  },
  vacancyLoginClose: async (input = {}) => {
    const identity = loginIdentity(input);
    return checked(
      await report('/api/vacancies/login-close', identity, {
        network: true,
        read: false,
      }),
      identity
    );
  },
});
