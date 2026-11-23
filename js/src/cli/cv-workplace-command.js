import { boundedCommandFile } from './technology-command.js';

const experienceInput = (args) => {
  if (
    [
      'file',
      'export-id',
      'resume',
      'job-index',
      'target-id',
      'fingerprint',
      'operation',
    ].some((name) => args[name] !== undefined) ||
    typeof args['experience-request-id'] !== 'string' ||
    typeof args['experience-fingerprint'] !== 'string' ||
    typeof args['experience-job-index'] !== 'string' ||
    !/^\d+$/u.test(args['experience-job-index'])
  ) {
    throw new Error(
      'Supply the experience request ID, fingerprint and zero-based plan row index together.'
    );
  }
  return {
    experience: {
      requestId: args['experience-request-id'],
      fingerprint: args['experience-fingerprint'],
      jobIndex: Number(args['experience-job-index']),
    },
    ...(args['record-id'] === undefined ? {} : { recordId: args['record-id'] }),
    ...(args['browser-slot'] === undefined
      ? {}
      : { browserSlot: args['browser-slot'] }),
  };
};

export const cvWorkplaceCommandInput = async (operation, args) => {
  if (
    operation === 'cv-workplace-plan' &&
    [
      'experience-request-id',
      'experience-fingerprint',
      'experience-job-index',
    ].some((name) => args[name] !== undefined)
  ) {
    return experienceInput(args);
  }
  const input = {
    browserSlot: args['browser-slot'] ?? 'jobs',
    fingerprint: args.fingerprint,
    exportId: args['export-id'],
    hash: args.resume,
    recordId: args['record-id'],
    targetId: args['target-id'],
    jobIndex:
      args['job-index'] === undefined ? undefined : Number(args['job-index']),
  };
  if (args.operation !== undefined) {
    input.operation = args.operation;
  }
  if (operation === 'cv-workplace-plan') {
    if (typeof args.file !== 'string') {
      throw new Error('Use --file=<fields.json|fields.lino|fields.bin>.');
    }
    const file = await boundedCommandFile(args.file);
    if (input.operation === 'detach') {
      input.fields = {};
      input.resumes = file;
    } else if (input.operation === 'copy') {
      if (
        !file ||
        Object.keys(file).length !== 2 ||
        !Object.hasOwn(file, 'fields') ||
        !Object.hasOwn(file, 'resumes')
      ) {
        throw new Error('Supply a copy file with fields and resumes.');
      }
      input.fields = file.fields;
      input.resumes = file.resumes;
    } else {
      input.fields = file;
    }
  }
  return input;
};
