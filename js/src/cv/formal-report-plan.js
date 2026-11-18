import {
  formalKindMarker,
  formalVersionMarker,
  formalReportBody,
  formalPayloadOf,
  mergeFormalSamples,
} from './formal-report-content.js';
import { modelFingerprint } from '../automation/answer-model-context.js';

const phrases = {
  'translation-gap': 'translation gap',
  'short-phrase': 'two or more words',
  placeholder: 'response:translate',
  misrouted: 'web search requested',
  unchanged: 'not translated',
  'wrong-language': 'translation wrong language',
  'empty-or-limit': 'empty translation',
};
const findIssue = async (github, kind, version, signal, known) => {
  const bound = await known(kind, version);
  let found = await github.search(formalKindMarker(kind).slice(5, -4), signal);
  if (bound && !found.some((issue) => issue.number === bound)) {
    found.push(await github.issue(bound, signal));
  }
  if (!found.length) {
    found = await github.search(
      `hh-job-application-automation formal-ai-failure kind=${kind === 'translation-gap' ? 'gap' : kind}`,
      signal
    );
  }
  if (!found.length) {
    found = await github.search(phrases[kind], signal);
  }
  found.sort((a, b) => b.number - a.number);
  return (
    found.find((issue) => issue.number === bound && issue.state === 'open') ??
    found.find((issue) => issue.state === 'open') ??
    found[0] ??
    null
  );
};
const matchingComment = async (github, issue, version, signal) => {
  const comments = await github.comments(issue, signal);
  const matches = comments.filter((comment) =>
    versionComment(comment, version)
  );
  if (!matches.length) {
    return null;
  }
  const login = await github.account(signal);
  if (matches.length !== 1 || matches[0].user?.login !== login) {
    throw new Error(
      'The existing version comment needs separate owner review.'
    );
  }
  return matches[0];
};
const legacyVersion = (body, version) =>
  body
    .split('\n')
    .some(
      (line) =>
        line.startsWith(
          '<!-- hh-job-application-automation formal-ai-failure kind='
        ) && line.endsWith(` version=${version} -->`)
    );
const versionComment = (comment, version) =>
  comment.body?.includes(formalVersionMarker(version)) ||
  legacyVersion(comment.body ?? '', version);

/** Recheck the exact public comment immediately before recording write intent. */
export const checkFormalReportTarget = async (github, action, signal) => {
  if (!action.issue) {
    return;
  }
  if ((await github.issue(action.issue, signal)).state !== 'open') {
    throw new Error('The selected upstream issue closed during review.');
  }
  const matches = (await github.comments(action.issue, signal)).filter(
    (comment) => versionComment(comment, action.version)
  );
  if (action.comment) {
    if (
      matches.length !== 1 ||
      matches[0].id !== action.comment ||
      (await modelFingerprint(matches[0].body)) !== action.previousFingerprint
    ) {
      throw new Error('The existing version comment changed during review.');
    }
  } else if (matches.length) {
    throw new Error('A version comment appeared during review.');
  }
};
const previousSamples = (comment, issue, version) => {
  const body = comment?.body ?? issue.body ?? '';
  const previous = formalPayloadOf(body);
  if (
    (body.includes(formalVersionMarker(version)) ||
      (comment && !legacyVersion(body, version))) &&
    previous?.version !== version
  ) {
    throw new Error('The existing report content could not be preserved.');
  }
  return previous?.version === version ? previous.samples : [];
};
const preserveComment = (comment, version, body) => {
  if (!comment) {
    return body;
  }
  const position = comment.body.indexOf(formalVersionMarker(version));
  const prefix =
    position < 0 ? comment.body : comment.body.slice(0, position).trim();
  return prefix ? `${prefix}\n\n${body}` : body;
};
const existingAction = async (github, group, signal) => {
  const issue = await github.issue(group.issue, signal);
  if (issue.state !== 'open') {
    throw new Error('The selected upstream issue closed during inspection.');
  }
  const comment = await matchingComment(
    github,
    group.issue,
    group.version,
    signal
  );
  const previous = previousSamples(comment, issue, group.version);
  const samples = mergeFormalSamples(previous, group.samples);
  const unchanged = samples.length === previous.length;
  return {
    operation: unchanged
      ? 'already-reported'
      : comment
        ? 'update-comment'
        : 'comment',
    version: group.version,
    issue: group.issue,
    ...(comment
      ? {
          comment: comment.id,
          previousFingerprint: await modelFingerprint(comment.body),
        }
      : {}),
    url: comment?.html_url ?? issue.html_url,
    body: preserveComment(
      comment,
      group.version,
      formalReportBody(group.version, samples)
    ),
  };
};

/** Several failure kinds targeting one issue share one version comment. */
export const planFormalReports = async (
  github,
  preview,
  signal,
  known = async () => null
) => {
  const groups = new Map();
  for (const version of preview.groups) {
    for (const kind of new Set(version.samples.map((sample) => sample.kind))) {
      signal.throwIfAborted();
      const issue = await findIssue(
        github,
        kind,
        version.version,
        signal,
        known
      );
      const open = issue?.state === 'open' ? issue.number : null;
      const key = `${version.version}:${open ?? 'new'}`;
      const group = groups.get(key) ?? {
        version: version.version,
        issue: open,
        samples: [],
        regressions: [],
      };
      group.samples.push(
        ...version.samples.filter((sample) => sample.kind === kind)
      );
      if (
        issue?.state === 'closed' &&
        !group.regressions.includes(issue.html_url)
      ) {
        group.regressions.push(issue.html_url);
      }
      groups.set(key, group);
    }
  }
  const actions = [];
  for (const group of groups.values()) {
    signal.throwIfAborted();
    actions.push(
      group.issue
        ? await existingAction(github, group, signal)
        : {
            operation: 'create',
            version: group.version,
            title: `Formal AI ${group.version}: workplace translations fail`,
            body: formalReportBody(
              group.version,
              group.samples,
              group.regressions.join(', ') || null
            ),
          }
    );
  }
  return actions;
};
