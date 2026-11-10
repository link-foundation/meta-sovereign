import { defaultStoreDir } from '../storage/app-directory.js';
import {
  configuredResume,
  saveConfiguredResume,
  deleteConfiguredResume,
} from '../forms/configured-resume.js';
import { loadResumePdf } from './forms-resume-file.js';

export const FORMS_RESUME_HELP =
  '  forms-resume  --action=status|save|delete [--file=<pdf-path>] [--revision=<saved-revision>] [--store=<dir>]';
export const formResumeCommands = ({ openStore }) => ({
  'forms-resume': async (args, log) => {
    const action = args.action ?? 'status';
    if (!['status', 'save', 'delete'].includes(action)) {
      throw new Error('Use résumé status, save or delete.');
    }
    const file = action === 'save' ? await loadResumePdf(args.file) : null;
    const store = await openStore(args.store ?? defaultStoreDir());
    try {
      const input = { file, revision: args.revision };
      const result =
        action === 'status'
          ? { ok: true, resume: await configuredResume(store) }
          : await (
              action === 'save' ? saveConfiguredResume : deleteConfiguredResume
            )(store, input);
      log(JSON.stringify(result));
      return 0;
    } finally {
      await store.close?.();
    }
  },
});
