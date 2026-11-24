import { createAssignmentGithub } from './github.js';
import { draftAssignment } from './draft.js';
import { publishAssignment } from './publish.js';
import { assignmentFailure } from './validation.js';
import { debugQuestionTurn } from '../automation/question-turns.js';
import { createAssignmentVacancyReader } from './vacancy-reader.js';
import { createAssignmentSourceReader } from './source-reader.js';
import { restoreAssignmentDraft } from './restore.js';

const owners = new WeakSet();
export const createAssignmentPublisher = ({
  store,
  modelRunner,
  github = createAssignmentGithub(),
  readVacancy = createAssignmentVacancyReader({ store }),
  readSource = createAssignmentSourceReader({ store }),
  resolveReview,
}) => {
  let active;
  let stopping = false;
  const perform = async (operation, input) => {
    if (stopping || owners.has(store)) {
      throw assignmentFailure(
        stopping ? 'stopped' : 'busy',
        'Another assignment operation is active or stopping.'
      );
    }
    const controller = new AbortController();
    owners.add(store);
    const task = operation(
      {
        store,
        modelRunner,
        github,
        readVacancy,
        readSource,
        signal: controller.signal,
      },
      input
    );
    active = { controller, task };
    try {
      const result = await task;
      debugQuestionTurn('assignment-operation', {
        state: result.state,
        ok: result.ok,
      });
      return result;
    } finally {
      active = null;
      owners.delete(store);
    }
  };
  const withReview = (operation, name) =>
    resolveReview
      ? async (context, input) =>
          operation(context, await resolveReview(input, name, context.signal))
      : operation;
  const draft = withReview(draftAssignment, 'draft');
  const restore = withReview(restoreAssignmentDraft, 'restore');
  return {
    draft: (input) => perform(draft, input),
    restore: (input) => perform(restore, input),
    publish: (input) => perform(publishAssignment, input),
    stop: async () => {
      stopping = true;
      const owned = active;
      owned?.controller.abort();
      await owned?.task.catch(() => {});
    },
  };
};
