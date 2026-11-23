import { assignmentTarget } from '../assignments/validation.js';
import { assignmentRepositoryConfirmed } from '../forms/assignment-repository.js';
import { assignmentFormUrl } from '../forms/assignment-recognition.js';
import { cliServerClient, localOrSecureOrigin } from './server-lino-client.js';

const draftId = /^assignment-draft:[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u;

export const usesActiveAssignmentServer = (args, source) =>
  args.server !== undefined ||
  args['review-slot'] !== undefined ||
  (!args['draft-id'] && !source.file && !source.url && !source.standalone);

const serverRequest = (args, source) => {
  if (args.store !== undefined) {
    throw new Error(
      'The Forms server owns the draft store. Choose --server or --store.'
    );
  }
  if (
    source.file ||
    source.url ||
    source.from ||
    (source.standalone && args['review-slot'] === undefined)
  ) {
    throw new Error(
      'Choose the active Forms review or a local instruction source.'
    );
  }
  const origin = localOrSecureOrigin(args.server);
  if (
    !origin ||
    (args.binary !== undefined &&
      ![true, false, 'true', 'false'].includes(args.binary))
  ) {
    throw new Error(
      'Use a local HTTP or HTTPS server origin and a boolean --binary flag.'
    );
  }
  return cliServerClient(origin, [true, 'true'].includes(args.binary));
};

const serverRefusal = (answer) =>
  Object.assign(
    new Error(
      answer?.error ?? 'The Forms server could not confirm the assignment.'
    ),
    { code: answer?.code ?? 'assignment-unconfirmed' }
  );

const requestDraft = async (request, input) => {
  const { ok, answer } = await request('/api/forms/assignment/draft', input);
  if (!ok || answer?.ok !== true) {
    throw serverRefusal(answer);
  }
  return answer;
};

const validReceipt = (receipt, expectedId, expectedTarget) => {
  const target = assignmentTarget(
    expectedTarget ?? receipt.repository?.fullName
  );
  return (
    receipt.ok === true &&
    receipt.state === 'verified' &&
    receipt.draftId === expectedId &&
    assignmentRepositoryConfirmed(receipt.repository, target) &&
    Number.isSafeInteger(receipt.issue?.number) &&
    receipt.issue.number > 0 &&
    typeof receipt.issue.url === 'string' &&
    receipt.issue.url.toLowerCase() ===
      `https://github.com/${target.toLowerCase()}/issues/${receipt.issue.number}`
  );
};

const uncertainReceipt = (receipt, id) =>
  receipt?.ok === false &&
  receipt.draftId === id &&
  receipt.state === 'uncertain';

const publish = async (request, id, target) => {
  if (!draftId.test(id)) {
    throw new Error('Use a saved assignment draft ID.');
  }
  const uncertain = {
    ok: false,
    state: 'uncertain',
    draftId: id,
    code: 'assignment-unconfirmed',
  };
  const response = await request('/api/forms/assignment/publish', {
    draftId: id,
  }).catch(() => null);
  const receipt = response?.answer;
  if (uncertainReceipt(receipt, id)) {
    return receipt;
  }
  if (!response?.ok && typeof receipt?.code === 'string') {
    throw serverRefusal(receipt);
  }
  try {
    return response?.ok && validReceipt(receipt, id, target)
      ? receipt
      : uncertain;
  } catch {
    return uncertain;
  }
};

const assignmentSlot = (args) => {
  const slot = args['review-slot'] ?? args['browser-slot'];
  if (args['review-slot'] !== undefined && args['browser-slot'] !== undefined) {
    throw new Error('Choose one Forms review slot.');
  }
  if (args['draft-id'] && slot !== undefined) {
    throw new Error(
      'The saved assignment draft already fixes its Forms review.'
    );
  }
  return slot ?? null;
};

export const activeAssignmentCommand = async ({
  args,
  source,
  dryRun,
  context,
  target,
  log,
}) => {
  const reviewSlot = assignmentSlot(args);
  const request = serverRequest(args, source);
  if (args['draft-id']) {
    const publication = await publish(request, args['draft-id']);
    log(JSON.stringify(publication));
    return publication.ok ? 0 : 1;
  }
  const name = await target();
  const result = await requestDraft(request, {
    ...context(),
    target: name,
    reviewSlot,
  });
  const draft = result.draft;
  if (
    result.state !== 'draft' ||
    draft?.target !== name ||
    !draftId.test(draft.id) ||
    assignmentFormUrl(draft.formUrl) !== draft.formUrl
  ) {
    throw new Error(
      'The Forms server did not confirm a draft from the active review.'
    );
  }
  if (dryRun) {
    log(JSON.stringify(result));
    return 0;
  }
  const publication = await publish(request, draft.id, name);
  log(JSON.stringify({ draft, publication }));
  return publication.ok ? 0 : 1;
};
