import { runAssignmentCommand } from './commands.js';
import { seedAssignmentHistory } from './github-seed.js';
import { assignmentFailure, assignmentTarget } from './validation.js';

const GUIDE_PATH =
  'repos/link-assistant/hive-mind/contents/docs/CI-CD-BEST-PRACTICES.md';
const parseReceipt = (stdout) => {
  const boundary = stdout.search(/\r?\n\r?\n/u);
  const headers = stdout.slice(0, boundary);
  const status = headers.match(/^HTTP\/[\d.]+\s+(\d{3})\b/u)?.[1];
  if (boundary < 0 || !status || !status.startsWith('2')) {
    throw assignmentFailure(
      'readback',
      'GitHub did not return a positive receipt.'
    );
  }
  return JSON.parse(stdout.slice(boundary).trim());
};

export const createAssignmentGithub = ({ run = runAssignmentCommand } = {}) => {
  const api = async (
    endpoint,
    { signal, method = 'GET', data, missing = false } = {}
  ) => {
    try {
      const { stdout } = await run(
        'gh',
        [
          'api',
          '--include',
          '--method',
          method,
          endpoint,
          ...(data ? ['--input', '-'] : []),
        ],
        {
          signal,
          input: data ? JSON.stringify(data) : '',
        }
      );
      return parseReceipt(stdout);
    } catch (error) {
      signal?.throwIfAborted();
      if (missing && /^HTTP\/[\d.]+\s+404\b/u.test(error.commandOutput ?? '')) {
        return null;
      }
      throw assignmentFailure(
        'github-unverified',
        'GitHub access or the requested receipt could not be verified.'
      );
    }
  };
  const repository = (target, options) =>
    api(`repos/${assignmentTarget(target)}`, { ...options, missing: true });
  return {
    owner: async () => {
      const value = await api('user');
      assignmentTarget(`${value.login}/assignment`);
      return value.login;
    },
    readGuide: async ({ signal } = {}) =>
      (
        await run(
          'gh',
          ['api', GUIDE_PATH, '-H', 'Accept: application/vnd.github.raw'],
          { signal }
        )
      ).stdout,
    repository,
    pipeline: async (target, options) => {
      const entries = await api(
        `repos/${assignmentTarget(target)}/contents/.github/workflows`,
        { ...options, missing: true }
      );
      if (entries !== null && !Array.isArray(entries)) {
        throw assignmentFailure(
          'readback',
          'GitHub did not confirm the workflow directory.'
        );
      }
      return (
        Array.isArray(entries) &&
        entries.some(
          (entry) =>
            entry.type === 'file' &&
            /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(entry.path)
        )
      );
    },
    create: async (draft, { signal, templateRepository }) => {
      if (!['public', 'private'].includes(draft.visibility)) {
        throw assignmentFailure('input', 'Invalid repository visibility.');
      }
      const args = [
        'repo',
        'create',
        assignmentTarget(draft.target),
        `--${draft.visibility}`,
      ];
      if (templateRepository.is_template === true) {
        args.push('--template', assignmentTarget(draft.template));
      }
      await run('gh', args, { signal });
    },
    seed: (draft, { signal, existing }) =>
      seedAssignmentHistory({
        run,
        target: draft.target,
        template: draft.template,
        signal,
        existing,
      }),
    issues: async (target, { signal }) => {
      const { stdout } = await run(
        'gh',
        [
          'api',
          '--paginate',
          '--slurp',
          `repos/${assignmentTarget(target)}/issues?state=all&per_page=100`,
        ],
        { signal }
      );
      const pages = JSON.parse(stdout);
      if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
        throw assignmentFailure(
          'readback',
          'GitHub returned invalid issue pages.'
        );
      }
      return pages.flat().filter((issue) => !issue.pull_request);
    },
    writeIssue: (draft, { signal, number, body }) => {
      if (
        number !== undefined &&
        (!Number.isSafeInteger(number) || number < 1)
      ) {
        throw assignmentFailure('input', 'Invalid issue number.');
      }
      return api(
        `repos/${assignmentTarget(draft.target)}/issues${number ? `/${number}` : ''}`,
        {
          signal,
          method: number ? 'PATCH' : 'POST',
          data: { title: draft.title, body },
        }
      );
    },
  };
};
