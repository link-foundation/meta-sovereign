import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { boundedCommandFile } from './technology-command.js';
import {
  saveExperienceDocument,
  storedExperienceDocuments,
  storedExperienceDocument,
  compareStoredExperience,
} from '../cv/experience-store.js';
import { experienceFromHhExport } from '../cv/experience-hh.js';
import { experienceDocumentToLino } from '../cv/experience-document.js';

export const createExperienceCommands = (openStore) =>
  Object.fromEntries(
    ['import', 'export', 'stored', 'from-hh', 'compare'].map((operation) => [
      `cv-experience-${operation}`,
      async (args, log) => {
        const dir = args.store ?? defaultStoreDir();
        const store = await openStore(dir);
        let result;
        if (operation === 'import') {
          if (typeof args.file !== 'string') {
            throw new Error(
              'Use --file=<experience.lino|experience.bin|experience.json>.'
            );
          }
          result = await saveExperienceDocument(
            store,
            await boundedCommandFile(args.file, 4 * 1024 * 1024)
          );
        } else if (operation === 'stored') {
          result = await storedExperienceDocuments(store);
        } else if (operation === 'compare') {
          result = await compareStoredExperience(store, {
            hh: args.hh,
            linkedin: args.linkedin,
          });
        } else if (operation === 'from-hh') {
          result = await experienceFromHhExport(
            { store, artifactRoot: path.join(dir, 'resume-exports') },
            {
              exportId: args['export-id'],
              hash: args.resume,
              browserSlot: args['browser-slot'] ?? 'jobs',
            }
          );
        } else {
          result = (await storedExperienceDocument(store, args.revision))
            .document;
          log(
            args.json
              ? JSON.stringify(result, null, 2)
              : experienceDocumentToLino(result)
          );
          return 0;
        }
        log(JSON.stringify(result, null, 2));
        return 0;
      },
    ])
  );
