import { promises as fs } from 'node:fs';
import { decodeWire } from '../transport/lino.js';
import { createFormReader, planFormAnswers } from '../forms/reader.js';
import { defaultStoreDir } from '../storage/app-directory.js';
import {
  createFormReviewCommands,
  FORMS_REVIEW_HELP,
} from './forms-review-commands.js';

export const FORMS_HELP = `  forms-read    --url=<http-url> [--browser-slot=<name>] [--headed|--headless] [--store=<dir>]
  forms-plan    --file=<inspection.json> [--profile-id=<id>] [--profile=<Lino>] [--approximate=false] [--source=<provider>] [--chat=<id>] [--store=<dir>]
${FORMS_REVIEW_HELP}`;

export const createFormsCommands = ({ openStore, ...readerOptions }) => ({
  ...createFormReviewCommands({ openStore, ...readerOptions }),
  'forms-plan': async (args, log) => {
    if (!args.file || (await fs.stat(args.file)).size > 4 * 1024 ** 2) {
      throw new Error('--file requires an inspection JSON file up to 4 MiB');
    }
    const raw = await fs.readFile(args.file, 'utf8');
    if (Buffer.byteLength(raw) > 4 * 1024 ** 2) {
      throw new Error('inspection file exceeds 4 MiB');
    }
    const inspection = JSON.parse(raw);
    const store = await openStore(args.store ?? defaultStoreDir());
    try {
      log(
        JSON.stringify(
          await planFormAnswers(store, {
            inspection,
            profileId: args['profile-id'],
            profile: args.profile ? decodeWire(args.profile) : undefined,
            approximate: ![false, 'false'].includes(args.approximate),
            source: args.source,
            chat: args.chat,
          }),
          null,
          2
        )
      );
      return 0;
    } finally {
      await store.close?.();
    }
  },
  'forms-read': async (args, log) => {
    if (
      args.headless !== undefined &&
      ![true, false, 'true', 'false'].includes(args.headless)
    ) {
      throw new Error('--headless must be true or false');
    }
    const store = await openStore(args.store ?? defaultStoreDir());
    const reader = createFormReader({ store, ...readerOptions });
    try {
      log(
        JSON.stringify(
          await reader.read({
            url: args.url,
            browserSlot: args['browser-slot'],
            headless:
              args.headed === true || args.headed === 'true'
                ? false
                : args.headless === undefined
                  ? undefined
                  : args.headless === true || args.headless === 'true',
          }),
          null,
          2
        )
      );
      return 0;
    } finally {
      try {
        await reader.stop();
      } finally {
        await store.close?.();
      }
    }
  },
});
