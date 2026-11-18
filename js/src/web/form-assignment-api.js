import {
  assignmentFormUrl,
  assignmentRecordId,
} from '../forms/assignment-recognition.js';
import {
  assignmentRepositoryName,
  assignmentRepositoryConfirmed,
} from '../forms/assignment-repository.js';

export const registerFormAssignment = async (report, input) => {
  const name = assignmentRepositoryName(input.repository);
  const result = await report('/api/forms/assignment/repository', input, {
    network: true,
  });
  const value = result?.assignment;
  if (
    result?.ok !== true ||
    value?.state !== 'verified' ||
    value.id !== (await assignmentRecordId(input.inspection.url)) ||
    value.formUrl !== assignmentFormUrl(input.inspection.url) ||
    typeof value.revision !== 'string' ||
    value.revision === input.revision ||
    !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value.revision) ||
    !assignmentRepositoryConfirmed(value.repository, name)
  ) {
    throw Object.assign(
      new Error('The assignment repository association was not confirmed.'),
      { code: result?.code ?? 'form-assignment-unconfirmed' }
    );
  }
  return result;
};
