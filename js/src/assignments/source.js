import { modelFingerprint } from '../automation/answer-model-context.js';
import {
  assignmentFailure,
  assignmentSourceUrl,
  assignmentText,
} from './validation.js';
export const assignmentOriginal = (assignment, source) =>
  [assignment.description, source?.title, source?.text]
    .filter(Boolean)
    .join('\n');

/** Validate injected/live reads equally; incomplete text never reaches a model. */
export const assignmentSourceReceipt = async (value, requestedUrl) => {
  if (
    !value ||
    value.complete !== true ||
    value.blocked ||
    value.scope !== 'visible-document-text' ||
    value.requestedUrl !== assignmentSourceUrl(requestedUrl) ||
    typeof value.capturedAt !== 'string' ||
    value.capturedAt.length > 40 ||
    !Number.isFinite(Date.parse(value.capturedAt))
  ) {
    throw assignmentFailure(
      'source-unreadable',
      'The complete instruction text was not readable.'
    );
  }
  const source = {
    requestedUrl: assignmentSourceUrl(value.requestedUrl),
    url: assignmentSourceUrl(value.url),
    title: assignmentText(value.title, 500, 'instruction title', true),
    text: assignmentText(value.text, 30000, 'instruction text'),
    capturedAt: value.capturedAt,
    complete: true,
    scope: 'visible-document-text',
  };
  const { text: _text, complete: _complete, ...evidence } = source;
  return {
    source,
    evidence: {
      ...evidence,
      fingerprint: await modelFingerprint([
        source.url,
        source.title,
        source.text,
      ]),
    },
  };
};

export const resolveAssignmentSource = async (
  { readSource, signal },
  input
) => {
  if (input.sourceUrl === undefined) {
    return null;
  }
  const url = assignmentSourceUrl(input.sourceUrl);
  const read = await readSource(url, { signal });
  signal.throwIfAborted();
  return assignmentSourceReceipt(read, url);
};

export const checkSavedAssignmentSource = async (record) => {
  if (!record.source && !record.draft.sourceEvidence) {
    return;
  }
  const { evidence } = await assignmentSourceReceipt(
    record.source,
    record.draft.sourceEvidence?.requestedUrl
  );
  const saved = record.draft.sourceEvidence;
  if (
    !saved ||
    evidence.fingerprint !== saved.fingerprint ||
    evidence.url !== saved.url ||
    evidence.title !== saved.title ||
    evidence.capturedAt !== saved.capturedAt ||
    evidence.scope !== saved.scope
  ) {
    throw assignmentFailure(
      'source-changed',
      'The saved instruction evidence changed. Review a new draft.'
    );
  }
};
