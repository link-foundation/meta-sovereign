import { setTimeout as delay } from 'node:timers/promises';
import { createExperiencePlanningService } from '../../js/src/cv/experience-plan-service.js';
import {
  createFormalExperienceReports,
  previewFormalExperienceReport,
} from '../../js/src/cv/formal-report-service.js';
import {
  experiencePlanFixture,
  settledExperiencePlan,
} from './experience-plan-fixture.mjs';

export const mockFormalGithub = (options = {}) => {
  const calls = [];
  const issues = new Map();
  const comments = new Map();
  const url = (number) =>
    `https://github.com/link-assistant/formal-ai/issues/${number}`;
  const addIssue = (number, body = '', state = 'open') => {
    const issue = { number, body, state, html_url: url(number) };
    issues.set(number, issue);
    return issue;
  };
  const github = {
    search: async (term, signal) => {
      calls.push({ operation: 'search', term });
      signal.throwIfAborted();
      await options.beforeSearch?.(term, signal);
      if (options.search) {
        return options.search(term, signal, { issues, comments });
      }
      return [...issues.values()].filter((issue) =>
        [
          issue.body,
          ...(comments.get(issue.number) ?? []).map((row) => row.body),
        ].some((body) => body.includes(term))
      );
    },
    issue: async (id, signal) => {
      calls.push({ operation: 'issue', id });
      signal.throwIfAborted();
      if (!issues.has(id)) {
        throw new Error('No synthetic issue');
      }
      return issues.get(id);
    },
    comments: async (id, signal) => {
      calls.push({ operation: 'comments', id });
      signal.throwIfAborted();
      return comments.get(id) ?? [];
    },
    account: async () => 'fixture-owner',
    write: async (action, signal) => {
      calls.push({ operation: 'write', action });
      if (options.write) {
        return options.write(action, signal);
      }
      signal.throwIfAborted();
      if (action.operation === 'create') {
        return addIssue(Math.max(100, ...issues.keys()) + 1, action.body);
      }
      const rows = comments.get(action.issue) ?? [];
      const id = action.comment ?? 500 + rows.length;
      const comment = {
        id,
        body: action.body,
        user: { login: 'fixture-owner' },
        html_url: `${url(action.issue)}#issuecomment-${id}`,
      };
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) {
        rows.push(comment);
      } else {
        rows[index] = comment;
      }
      comments.set(action.issue, rows);
      return comment;
    },
  };
  return { github, calls, issues, comments, addIssue };
};
export const settledFormalReport = async (service, requestId) => {
  const deadline = Date.now() + 3000;
  let row;
  do {
    row = await service.status({ requestId });
    if (!['preparing', 'publishing'].includes(row.phase)) {
      return row;
    }
    await delay(10);
  } while (Date.now() < deadline);
  throw new Error(`Finite report fixture did not settle: ${row?.phase}`);
};
export const formalReportFixture = async (options = {}) => {
  const fixture = await experiencePlanFixture(options);
  const planning = createExperiencePlanningService(fixture);
  let plan;
  try {
    await planning.start(fixture.input('report-source-plan'));
    plan = await settledExperiencePlan(planning, 'report-source-plan');
    if (plan.phase !== 'completed') {
      throw new Error('Synthetic report plan failed');
    }
  } finally {
    await planning.close();
  }
  const preview = await previewFormalExperienceReport(fixture.store, {
    planRequestId: 'report-source-plan',
  });
  const mock = mockFormalGithub(options);
  const reports = createFormalExperienceReports({
    store: fixture.store,
    github: mock.github,
  });
  return {
    ...fixture,
    plan,
    ...mock,
    preview,
    reports,
    input: (requestId = 'formal-report', mode = 'dry-run') => ({
      requestId,
      planRequestId: preview.planRequestId,
      review: preview.fingerprint,
      mode,
      confirm: mode === 'publish',
    }),
    close: () => reports.close(),
  };
};
