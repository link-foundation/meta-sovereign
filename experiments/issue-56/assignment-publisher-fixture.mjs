import { createMemoryStore } from '../../js/src/storage/universal.js';
import { rememberFormAssignment } from '../../js/src/forms/assignment-store.js';
import { createAssignmentPublisher } from '../../js/src/assignments/service.js';
import {
  assignmentInspection,
  assignmentReceipt,
  seedAssignmentAnswers,
} from './forms-assignment-fixture.mjs';

export const assignmentGuide = `## Recommended CI/CD Templates

| Language | Template Repository |
| --- | --- |
| Python | [Python pipeline](https://github.com/fixture-templates/python-pipeline) |
| JavaScript/TypeScript | [JS pipeline](https://github.com/fixture-templates/js-pipeline) |

## Later examples
| Python | [Unrelated example](https://github.com/other-owner/unrelated) |
`;
export const assignmentModelResult = {
  title: 'Inventory planning exercise',
  body: 'Propose an inventory application with a clear interface and durable records. Explain how the design will be checked and outline the tradeoffs for the chosen approach.',
  language: 'python',
  stack: 'FastAPI and SQLite',
  reason: 'The tools support a compact service with clear validation.',
  deliverable: 'code',
  originalLanguage: 'English',
};
export const assignmentPublisherFixture = async () => {
  const store = createMemoryStore();
  await seedAssignmentAnswers(store);
  const inspection = assignmentInspection();
  const assignment = await rememberFormAssignment(store, inspection);
  const state = {
    repository: null,
    pipeline: false,
    issues: [],
    calls: [],
    modelCalls: [],
  };
  const github = {
    readGuide: async () => {
      state.calls.push('guide');
      return assignmentGuide;
    },
    repository: async (target) => {
      state.calls.push(`repository:${target}`);
      return target.startsWith('fixture-templates/')
        ? { ...assignmentReceipt(target), is_template: true, private: false }
        : state.repository;
    },
    pipeline: async () => {
      state.calls.push('pipeline');
      return state.pipeline;
    },
    create: async (draft, { templateRepository }) => {
      state.calls.push('create');
      state.repository = {
        ...assignmentReceipt(draft.target),
        private: draft.visibility === 'private',
      };
      state.pipeline = templateRepository.is_template;
    },
    seed: async () => {
      state.calls.push('seed');
      state.pipeline = true;
    },
    issues: async () => {
      state.calls.push('issues');
      return globalThis.structuredClone(state.issues);
    },
    writeIssue: async (draft, { number = 1, body }) => {
      state.calls.push(
        number === 1 && !state.issues.length ? 'create-issue' : 'update-issue'
      );
      state.issues = [
        {
          number,
          html_url: `https://github.com/${draft.target}/issues/${number}`,
          title: draft.title,
          body,
          updated_at: '2026-01-01T00:00:00Z',
        },
      ];
      return state.issues[0];
    },
  };
  const modelRunner = async (request) => {
    state.modelCalls.push(request);
    return globalThis.structuredClone(assignmentModelResult);
  };
  const publisher = createAssignmentPublisher({ store, github, modelRunner });
  const input = {
    inspection,
    revision: assignment.revision,
    target: 'fixture-owner/reviewed-task',
    visibility: 'private',
    vacancy: {
      title: 'Python developer',
      description: 'Build internal inventory tools.',
      company: 'Example Employer',
    },
  };
  return {
    store,
    inspection,
    assignment,
    state,
    github,
    modelRunner,
    publisher,
    input,
  };
};
