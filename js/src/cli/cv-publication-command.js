import { randomUUID } from 'node:crypto';

export const cvPublicationCommandInput = (operation, args) => ({
  browserSlot: args['browser-slot'],
  requestId:
    args['request-id'] ??
    (operation === 'cv-publish-plan' ? randomUUID() : undefined),
  ...(operation === 'cv-publish-plan'
    ? {
        repository: args.repository,
        remote: args.remote,
        directory: args.directory,
        ...(args['export-id'] === undefined
          ? {}
          : { exportId: args['export-id'] }),
        resumes:
          typeof (args.resumes ?? args.resume) === 'string'
            ? (args.resumes ?? args.resume)
                .split(',')
                .map((value) => value.trim())
            : undefined,
      }
    : operation === 'cv-publish'
      ? {
          confirmation: args.confirmation,
          publish: args.publish === true || args.publish === 'true',
        }
      : {}),
});

/** Cancellation drains Git and persists an uncertain receipt; it never retries. */
export const foregroundCvPublication = async (service, operation, input) => {
  let cancelling;
  const stop = () => {
    cancelling ??= service.cancel();
    cancelling.catch(() => {});
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    return await service[operation](input);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await cancelling;
  }
};
