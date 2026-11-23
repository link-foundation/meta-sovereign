import { createAssignmentPublisher } from '../assignments/service.js';
import { createAssignmentGithub } from '../assignments/github.js';
import { assignmentTarget } from '../assignments/validation.js';
import { assignmentLanguageOverride } from '../assignments/templates.js';
import { rememberFormAssignment } from '../forms/assignment-store.js';
import { createFormReader } from '../forms/reader.js';
import { decodeWire } from '../transport/lino.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { loadFormInspection } from './forms-inspection-file.js';
import { withAnswerModel } from './answer-model-commands.js';
import {
  assignmentSourceArguments,
  readAssignmentCommandText,
} from './assignment-command-source.js';

export { TEST_ASSIGNMENT_HELP } from './help.js';

const booleanFlag = (args, key) => {
  if (
    args[key] !== undefined &&
    ![true, false, 'true', 'false'].includes(args[key])
  ) {
    throw new Error(`--${key} must be true or false`);
  }
  return [true, 'true'].includes(args[key]);
};
const inspect = async (args, { file, url }, reader) => {
  if (file && url) {
    throw new Error('Choose --file or --url.');
  }
  return file
    ? loadFormInspection(file)
    : reader.read({
        url,
        browserSlot: args['browser-slot'] ?? 'assignment',
        headless:
          args.headless === undefined
            ? undefined
            : booleanFlag(args, 'headless'),
      });
};

const commandAssignment = async ({
  args,
  source,
  reader,
  store,
  signal,
  stdin,
}) => {
  if (source.standalone) {
    return {
      standalone: true,
      ...(source.from !== undefined
        ? {
            sourceText: await readAssignmentCommandText(
              source.from,
              stdin,
              signal
            ),
          }
        : {}),
    };
  }
  const inspection = await inspect(args, source, reader);
  const assignment = await rememberFormAssignment(store, inspection);
  return { inspection, revision: args.revision ?? assignment?.revision };
};

const commandDraft = async ({
  args,
  source,
  reader,
  store,
  signal,
  stdin,
  github,
  publisher,
  languageOverride,
  name,
}) => {
  const assignment = await commandAssignment({
    args,
    source,
    reader,
    store,
    signal,
    stdin,
  });
  const target = assignmentTarget(
    name?.includes('/')
      ? name
      : `${args.owner ?? (await github.owner())}/${name}`
  );
  return (
    await publisher.draft({
      ...assignment,
      target,
      visibility: args.visibility ?? 'private',
      vacancyUrl: args.vacancy,
      sourceUrl: args.source,
      languageOverride,
      vacancy: args['vacancy-snapshot']
        ? decodeWire(args['vacancy-snapshot'])
        : undefined,
      refreshVacancy: booleanFlag(args, 'refresh-vacancy'),
      employers: args.employer ? [args.employer] : [],
    })
  ).draft;
};

export const testAssignmentCommand =
  ({ openStore, assignmentStdin, ...options }) =>
  async (args, log) => {
    const dryRun = booleanFlag(args, 'dry-run');
    const languageOverride = assignmentLanguageOverride(args.language);
    const source = assignmentSourceArguments(args);
    const name = args._?.[0];
    if (args['draft-id'] && dryRun) {
      throw new Error('Choose --draft-id to recover or --dry-run to draft.');
    }
    if (args['draft-id'] && languageOverride !== undefined) {
      throw new Error('The saved assignment draft already fixes its language.');
    }
    if (
      args['draft-id'] &&
      (args.from !== undefined || args.source !== undefined)
    ) {
      throw new Error(
        'The saved assignment draft already fixes its instruction source.'
      );
    }
    if (!args['draft-id']) {
      assignmentTarget(name?.includes('/') ? name : `owner/${name ?? ''}`);
    }
    const store = await openStore(args.store ?? defaultStoreDir());
    try {
      return await withAnswerModel(options.modelRunner, async (modelRunner) => {
        const github = options.assignmentGithub ?? createAssignmentGithub();
        const reader = createFormReader({ store, ...options });
        const publisher = createAssignmentPublisher({
          store,
          modelRunner,
          github,
          readVacancy: options.readAssignmentVacancy,
          readSource: options.readAssignmentSource,
        });
        const inputAbort = new AbortController();
        const stop = () => {
          inputAbort.abort();
          publisher.stop().catch(() => {});
          reader.stop().catch(() => {});
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        try {
          if (args['draft-id']) {
            const publication = await publisher.publish({
              draftId: args['draft-id'],
            });
            log(JSON.stringify(publication));
            return publication.ok ? 0 : 1;
          }
          const draft = await commandDraft({
            args,
            source,
            reader,
            store,
            signal: inputAbort.signal,
            stdin: assignmentStdin,
            github,
            publisher,
            languageOverride,
            name,
          });
          if (dryRun) {
            log(JSON.stringify({ ok: true, state: 'draft', draft }));
            return 0;
          }
          const publication = await publisher.publish({ draftId: draft.id });
          log(JSON.stringify({ draft, publication }));
          return publication.ok ? 0 : 1;
        } finally {
          process.removeListener('SIGINT', stop);
          process.removeListener('SIGTERM', stop);
          await Promise.allSettled([publisher.stop(), reader.stop()]);
        }
      });
    } finally {
      await store.close?.();
    }
  };
