import {
  configuredResume,
  configuredResumeMetadata,
  FORM_RESUME_ID,
  saveConfiguredResume,
  deleteConfiguredResume,
} from '../forms/configured-resume.js';
import { portableResumePdf } from '../forms/resume-data.js';

const unconfirmed = (result) =>
  Object.assign(
    new Error(result?.error ?? 'The saved résumé was not confirmed.'),
    { code: result?.code ?? 'form-resume-unconfirmed' }
  );
const confirmed = (result) => {
  if (result?.ok !== true || !Object.hasOwn(result, 'resume')) {
    throw unconfirmed(result);
  }
  return {
    ok: true,
    resume:
      result.resume === null
        ? null
        : configuredResumeMetadata({
            id: FORM_RESUME_ID,
            metadata: result.resume,
            revision: result.resume?.revision,
            updatedAt: result.resume?.updatedAt,
          }),
  };
};
export const createFormResumeApi = ({
  get,
  getResume = get,
  report,
  local,
}) => {
  const fallback = async (action, input) =>
    local
      ? action(await local(), input)
      : { ok: false, code: 'server-required' };
  return {
    formsResume: async () =>
      confirmed(
        (await getResume('/api/forms/resume')) ??
          (await fallback(async (store) => ({
            ok: true,
            resume: await configuredResume(store),
          })))
      ),
    saveFormsResume: async (input) => {
      const expected = await portableResumePdf(input.file);
      const result = confirmed(
        (await report('/api/forms/resume/save', input, { network: true })) ??
          (await fallback(saveConfiguredResume, input))
      );
      if (
        !result.resume ||
        result.resume.revision === input.revision ||
        !Object.keys(expected).every(
          (key) => expected[key] === result.resume[key]
        )
      ) {
        throw unconfirmed();
      }
      return result;
    },
    deleteFormsResume: async (input) => {
      const result = confirmed(
        (await report('/api/forms/resume/delete', input, { network: true })) ??
          (await fallback(deleteConfiguredResume, input))
      );
      if (result.resume !== null) {
        throw unconfirmed();
      }
      return result;
    },
  };
};
