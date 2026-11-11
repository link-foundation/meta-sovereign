import { defaultStoreDir } from '../storage/app-directory.js';
import { createAssignmentRepositoryService } from '../forms/assignment-service.js';
import { loadFormInspection } from './forms-inspection-file.js';
import {
  TEST_ASSIGNMENT_HELP,
  testAssignmentCommand,
} from './test-assignment-command.js';

export const FORMS_ASSIGNMENT_HELP = `  forms-assignment-link --file=<inspection.json> --repository=<https://github.com/owner/repo> --revision=<assignment-revision> [--store=<dir>]\n${TEST_ASSIGNMENT_HELP}`;
export const formsAssignmentCommands = ({
  openStore,
  verifyAssignmentRepository,
  ...options
}) => ({
  'test-assignment': testAssignmentCommand({ openStore, ...options }),
  'forms-assignment-link': async (args, log) => {
    const inspection = await loadFormInspection(args.file);
    const store = await openStore(args.store ?? defaultStoreDir());
    const service = createAssignmentRepositoryService({
      store,
      verifyRepository: verifyAssignmentRepository,
    });
    const stop = () => {
      service.stop().catch(() => {});
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      log(
        JSON.stringify(
          await service.register({
            inspection,
            repository: args.repository,
            revision: args.revision,
          })
        )
      );
      return 0;
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
      try {
        await service.stop();
      } finally {
        await store.close?.();
      }
    }
  },
});
