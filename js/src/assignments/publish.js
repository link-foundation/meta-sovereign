import { readAnswerModel } from '../automation/answer-model-config.js';
import {
  storedFormAssignment,
  assignmentState,
} from '../forms/assignment-store.js';
import { assignmentRepositoryReceipt } from '../forms/assignment-repository.js';
import { writeAnswerKnowledge } from '../automation/question-knowledge.js';
import { checkAssignmentRestatement } from './privacy.js';
import { assignmentFailure } from './validation.js';
import {
  assignmentPublicationId,
  assignmentIssueMarker,
  issueSnapshot,
  markedAssignmentIssue,
  readAssignmentDraft,
  writePublication,
  assignmentWriteIssued,
} from './records.js';

const assertCurrent = async (store, draft, signal) => {
  signal.throwIfAborted();
  const current = await storedFormAssignment(store, draft.formUrl);
  if (
    current?.id !== draft.assignmentId ||
    current.revision !== draft.assignmentRevision ||
    (await readAnswerModel(store)).revision !== draft.modelRevision
  ) {
    throw assignmentFailure(
      'changed',
      'The assignment or model settings changed. Review a new draft.'
    );
  }
  return current;
};
const reserve = (store, id, draft, effect) =>
  writePublication(store, id, (previous) => {
    if (previous?.[effect]) {
      throw assignmentFailure(
        'uncertain',
        'A previous write is awaiting positive readback. It will not be repeated.'
      );
    }
    return { draftId: draft.id, [effect]: true, stage: effect };
  });

const repositoryChanged = (receipt, repository, draft, ledger) =>
  (draft.repositoryId !== null && receipt.id !== draft.repositoryId) ||
  (ledger?.repository && receipt.id !== ledger.repository.id) ||
  repository.private !== (draft.visibility === 'private');

const ensureRepository = async (context, draft) => {
  const { store, github, signal, id } = context;
  let repository = await github.repository(draft.target, { signal });
  let ledger = await store.get(id);
  const existed = Boolean(repository);
  if (repository && draft.repositoryId === null && !ledger?.repositoryIssued) {
    throw assignmentFailure(
      'changed',
      'The repository appeared after preview. Review it before publishing.'
    );
  }
  if (!repository) {
    await assertCurrent(store, draft, signal);
    const templateRepository = await github.repository(draft.template, {
      signal,
    });
    if (
      !templateRepository ||
      typeof templateRepository.is_template !== 'boolean'
    ) {
      throw assignmentFailure(
        'template',
        'The selected CI/CD template could not be verified.'
      );
    }
    await reserve(store, id, draft, 'repositoryIssued');
    await github.create(draft, { signal, templateRepository });
    repository = await github.repository(draft.target, { signal });
  }
  const receipt = assignmentRepositoryReceipt(
    repository,
    draft.target,
    Date.now
  );
  if (repositoryChanged(receipt, repository, draft, ledger)) {
    throw assignmentFailure(
      'changed',
      'The repository identity or visibility changed.'
    );
  }
  if (!(await github.pipeline(draft.target, { signal }))) {
    await assertCurrent(store, draft, signal);
    await reserve(store, id, draft, 'seedIssued');
    await github.seed(draft, { signal, existing: existed });
    if (!(await github.pipeline(draft.target, { signal }))) {
      throw assignmentFailure(
        'pipeline',
        'The template pipeline was not confirmed.'
      );
    }
  }
  ledger = await writePublication(store, id, () => ({
    repository: receipt,
    stage: 'repository-verified',
  }));
  return ledger.repository;
};

const ensureIssue = async (context, draft) => {
  const { store, github, signal, id } = context;
  const marker = await assignmentIssueMarker(draft.assignmentId, draft.target);
  const body = `${draft.body}\n\n${marker}`;
  const find = async () =>
    markedAssignmentIssue(
      await github.issues(draft.target, { signal }),
      marker
    );
  let issue = await find();
  if (issue?.title === draft.title && issue.body === body) {
    return issue;
  }
  if (
    issue &&
    (await issueSnapshot(issue)).fingerprint !==
      draft.issueSnapshot?.fingerprint
  ) {
    throw assignmentFailure(
      'changed',
      'The assignment issue changed after preview. Review it again.'
    );
  }
  await assertCurrent(store, draft, signal);
  if (!issue) {
    await reserve(store, id, draft, 'issueIssued');
  } else {
    await reserve(store, id, draft, 'issueUpdateIssued');
  }
  await github.writeIssue(draft, { signal, number: issue?.number, body });
  issue = await find();
  if (!issue || issue.title !== draft.title || issue.body !== body) {
    throw assignmentFailure(
      'uncertain',
      'GitHub did not confirm the complete published issue.'
    );
  }
  return issue;
};

const issueReceipt = (issue, target) => {
  if (
    !Number.isSafeInteger(issue?.number) ||
    issue.number < 1 ||
    issue.html_url !== `https://github.com/${target}/issues/${issue.number}`
  ) {
    throw assignmentFailure(
      'readback',
      'GitHub did not confirm the assignment issue identity.'
    );
  }
  return { number: issue.number, url: issue.html_url };
};

const assertPendingDraft = (previous, draft) => {
  if (
    previous?.draftId !== draft.id &&
    previous?.stage !== 'verified' &&
    assignmentWriteIssued(previous)
  ) {
    throw assignmentFailure(
      'pending',
      'Recover the already issued publication before using another draft.'
    );
  }
};

export const publishAssignment = async ({ store, github, signal }, input) => {
  const { draft, employers } = await readAssignmentDraft(store, input.draftId);
  const id = await assignmentPublicationId(draft.assignmentId, draft.target);
  const previous = await store.get(id);
  assertPendingDraft(previous, draft);
  if (previous?.stage === 'verified' && previous.draftId === draft.id) {
    const association = await storedFormAssignment(store, draft.formUrl);
    if (
      association?.revision === previous.result.assignment.revision &&
      association.repository?.id === previous.result.repository.id
    ) {
      return previous.result;
    }
    // A confirmed publication may outlive a failed final local association write.
    return writeAnswerKnowledge(store, async () => {
      const latest = await assertCurrent(store, draft, signal);
      await store.put({
        ...latest,
        revision: previous.result.assignment.revision,
        repository: previous.result.repository,
      });
      await store.flush?.();
      return previous.result;
    });
  }
  const current = await assertCurrent(store, draft, signal);
  checkAssignmentRestatement({
    original: current.description,
    employers,
    title: draft.title,
    body: draft.body,
    extra: draft.target,
  });
  if (previous?.stage === 'verified' && previous.draftId !== draft.id) {
    await writePublication(store, id, () => ({
      draftId: draft.id,
      stage: 'prepared',
      repositoryIssued: false,
      seedIssued: false,
      issueIssued: false,
      issueUpdateIssued: false,
    }));
  }
  const context = { store, github, signal, id };
  try {
    const repository = await ensureRepository(context, draft);
    const issue = issueReceipt(await ensureIssue(context, draft), draft.target);
    return await writeAnswerKnowledge(store, async () => {
      const latest = await assertCurrent(store, draft, signal);
      const next = {
        ...latest,
        revision: globalThis.crypto.randomUUID(),
        repository,
      };
      const result = {
        ok: true,
        state: 'verified',
        draftId: draft.id,
        repository,
        issue,
        assignment: assignmentState(next),
      };
      await store.put({
        id,
        version: 1,
        tokens: ['assignment', 'publication'],
        children: [],
        ...(await store.get(id)),
        stage: 'verified',
        draftId: draft.id,
        result,
      });
      await store.put(next);
      await store.flush?.();
      return result;
    });
  } catch (error) {
    const ledger = await store.get(id);
    if (ledger) {
      return {
        ok: false,
        state: 'uncertain',
        draftId: draft.id,
        code: error.code ?? 'assignment-unverified',
        stage: ledger.stage,
      };
    }
    throw error;
  }
};
