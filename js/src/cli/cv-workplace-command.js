import { boundedCommandFile } from './technology-command.js';

export const cvWorkplaceCommandInput = async (operation, args) => {
  const input = {
    browserSlot: args['browser-slot'] ?? 'jobs',
    fingerprint: args.fingerprint,
    exportId: args['export-id'],
    hash: args.resume,
    recordId: args['record-id'],
    jobIndex:
      args['job-index'] === undefined ? undefined : Number(args['job-index']),
  };
  if (operation === 'cv-workplace-plan') {
    if (typeof args.file !== 'string') {
      throw new Error('Use --file=<fields.json|fields.lino|fields.bin>.');
    }
    input.fields = await boundedCommandFile(args.file);
  }
  return input;
};
