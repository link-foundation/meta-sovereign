import { createAssignmentPublisher } from '../assignments/service.js';
import { createAssignmentGithub } from '../assignments/github.js';
import { assignmentTarget } from '../assignments/validation.js';
import { rememberFormAssignment } from '../forms/assignment-store.js';
import { createFormReader } from '../forms/reader.js';
import { decodeWire } from '../transport/lino.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import { loadFormInspection } from './forms-inspection-file.js';
import { withAnswerModel } from './answer-model-commands.js';

export const TEST_ASSIGNMENT_HELP =
  '  test-assignment <name|owner/name> --file=<inspection.json>|--url=<form-url> [--vacancy=<hh-url>] [--visibility=private|public] [--employer=<name>] [--dry-run] [--draft-id=<saved-draft>] [--store=<dir>]';

const booleanFlag = (args, key) => {
  if (
    args[key] !== undefined &&
    ![true, false, 'true', 'false'].includes(args[key])
  ) {
    throw new Error(`--${key} must be true or false`);
  }
  return [true, 'true'].includes(args[key]);
};
const inspect = async (args, reader) => {
  if (args.file && args.url) {
    throw new Error('Choose --file or --url.');
  }
  return args.file
    ? loadFormInspection(args.file)
    : reader.read({
        url: args.url,
        browserSlot: args['browser-slot'] ?? 'assignment',
        headless:
          args.headless === undefined
            ? undefined
            : booleanFlag(args, 'headless'),
      });
};

export const testAssignmentCommand =
  ({ openStore, ...options }) =>
  async (args, log) => {
    const dryRun = booleanFlag(args, 'dry-run');
    const name = args._?.[0];
    if (args['draft-id'] && dryRun) {
      throw new Error('Choose --draft-id to recover or --dry-run to draft.');
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
        });
        const stop = () => {
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
          const inspection = await inspect(args, reader);
          const assignment = await rememberFormAssignment(store, inspection);
          const target = assignmentTarget(
            name?.includes('/')
              ? name
              : `${args.owner ?? (await github.owner())}/${name}`
          );
          const draft = (
            await publisher.draft({
              inspection,
              revision: args.revision ?? assignment?.revision,
              target,
              visibility: args.visibility ?? 'private',
              vacancyUrl: args.vacancy,
              vacancy: args['vacancy-snapshot']
                ? decodeWire(args['vacancy-snapshot'])
                : undefined,
              refreshVacancy: booleanFlag(args, 'refresh-vacancy'),
              employers: args.employer ? [args.employer] : [],
            })
          ).draft;
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
