import { modelFingerprint } from '../automation/answer-model-context.js';
import {
  assignmentFailure,
  assignmentSourceUrl,
  assignmentText,
} from './validation.js';
export const PROVIDED_ASSIGNMENT_SCOPE = 'owner-provided-text';
const validCapture = (value) =>
  typeof value === 'string' &&
  value.length <= 40 &&
  Number.isFinite(Date.parse(value));

export const assignmentOriginal = (assignment, source, vacancy) =>
  [assignment.description, source?.title, source?.text, vacancy.description]
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
    !validCapture(value.capturedAt)
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

export const providedAssignmentText = (text) =>
  assignmentText(text, 30000, 'assignment instructions');

export const providedAssignmentFingerprint = (text) =>
  modelFingerprint([PROVIDED_ASSIGNMENT_SCOPE, providedAssignmentText(text)]);

const providedAssignmentSource = async (value, capturedAt) => {
  if (!validCapture(capturedAt)) {
    throw assignmentFailure(
      'source-changed',
      'The instruction capture time is invalid.'
    );
  }
  const text = providedAssignmentText(value);
  const provenance = { scope: PROVIDED_ASSIGNMENT_SCOPE, capturedAt };
  return {
    source: { ...provenance, text },
    evidence: {
      ...provenance,
      fingerprint: await providedAssignmentFingerprint(text),
    },
  };
};

export const resolveAssignmentSource = async (
  { readSource, signal },
  input
) => {
  if (input.sourceText !== undefined) {
    if (!input.standalone || input.sourceUrl !== undefined) {
      throw assignmentFailure(
        'input',
        'Use one standalone instruction source.'
      );
    }
    return providedAssignmentSource(input.sourceText, new Date().toISOString());
  }
  if (input.sourceUrl === undefined) {
    if (input.standalone) {
      throw assignmentFailure(
        'input',
        'Provide instructions or a readable document URL.'
      );
    }
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
  const saved = record.draft.sourceEvidence;
  const { evidence } =
    record.source?.scope === PROVIDED_ASSIGNMENT_SCOPE
      ? await providedAssignmentSource(
          record.source.text,
          record.source.capturedAt
        )
      : await assignmentSourceReceipt(record.source, saved?.requestedUrl);
  if (
    !saved ||
    evidence.fingerprint !== saved.fingerprint ||
    evidence.requestedUrl !== saved.requestedUrl ||
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
