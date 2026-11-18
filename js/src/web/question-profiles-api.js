import {
  listAnswerProfiles,
  readAnswerProfile,
  saveAnswerProfile,
  deleteAnswerProfile,
  normalizeSavedAnswerProfile,
  answerProfileMetadata,
  answerProfileId,
} from '../automation/question-profiles.js';
import { normalizeAnswerProfile } from '../automation/question-profile.js';

const confirmedProfile = (result, input, write = false) => {
  const profile = normalizeSavedAnswerProfile(result?.profile);
  if (profile.id !== answerProfileId(input.id)) {
    throw new Error('named answer profile identity was not confirmed');
  }
  if (write) {
    const values = normalizeAnswerProfile(input.values);
    if (
      profile.revision === input.revision ||
      profile.name !== input.name.trim() ||
      Object.keys(values).length !== Object.keys(profile.values).length ||
      Object.keys(values).some((key) => profile.values[key] !== values[key])
    ) {
      throw new Error('named answer profile save was not confirmed');
    }
  }
  return { profile };
};

export const questionProfilesApi = ({ remote, store }) => {
  const root = '/api/automations/answers/profiles';
  const call = async (action, input, fallback, read = false) => {
    const result = await (remote.report ?? remote.post)(
      `${root}/${action}`,
      input,
      {
        network: true,
        read,
      }
    );
    if (result?.error || result?.status === 'failed') {
      throw Object.assign(new Error(result.error ?? result.code), {
        code: result.code,
      });
    }
    return result ?? fallback();
  };
  return {
    answerProfiles: async () => {
      const result = await remote.get(root);
      if (result?.error) {
        throw new Error(result.error);
      }
      if (
        result &&
        (!Array.isArray(result.profiles) || result.profiles.length > 50)
      ) {
        throw new Error('invalid named answer profile list');
      }
      return result
        ? result.profiles.map(answerProfileMetadata)
        : listAnswerProfiles(store);
    },
    readAnswerProfile: async (id) =>
      confirmedProfile(
        await call(
          'read',
          { id },
          async () => ({
            profile: await readAnswerProfile(store, id),
          }),
          true
        ),
        { id }
      ),
    saveAnswerProfile: async (input) =>
      confirmedProfile(
        await call('save', input, async () => ({
          profile: await saveAnswerProfile(store, input),
        })),
        input,
        true
      ),
    deleteAnswerProfile: async (input) => {
      const result = await call('delete', input, () =>
        deleteAnswerProfile(store, input)
      );
      if (result?.deleted !== answerProfileId(input.id)) {
        throw new Error('named answer profile deletion was not confirmed');
      }
      return result;
    },
  };
};
