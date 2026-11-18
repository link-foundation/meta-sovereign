import { randomUUID } from 'node:crypto';
import { technologyCommandInput } from './technology-command.js';

/** The selected private file contains {texts:[...]}; never print it in diagnostics. */
export const cvTranslationCommandInput = async (operation, args) => {
  const identity = {
    browserSlot: args['browser-slot'] ?? 'jobs',
    requestId: args['request-id'],
  };
  if (operation !== 'cv-translate') {
    return identity;
  }
  // Reuse the bounded file reader used by technology imports.
  const source = await technologyCommandInput('technology-catalog-save', args);
  return {
    ...identity,
    requestId: identity.requestId ?? randomUUID(),
    from: args.from,
    to: args.to,
    texts: source.texts,
    providers:
      args.providers === undefined
        ? undefined
        : String(args.providers).split(','),
    models: Object.fromEntries(
      ['haiku', 'luna'].flatMap((name) =>
        args[`${name}-model`] === undefined
          ? []
          : [[name, args[`${name}-model`]]]
      )
    ),
  };
};
