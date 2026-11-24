import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { saveExperienceDocument } from './experience-store.js';
import { PrivateCvJob } from './private-job.js';
import { createLinkedinExperienceReader } from './linkedin-experience-reader.js';
import { readLinkedinEvidence } from './linkedin-experience-evidence.js';
import {
  linkedinExportFailure,
  linkedinExportKey,
  linkedinExportOptions,
  checkedLinkedinExport,
  linkedinExportView,
  newLinkedinExport,
} from './linkedin-experience-record.js';

const exportWork = (store, read) => async (owned, save) => {
  let result;
  let saved = false;
  try {
    const signal = owned.controller.signal;
    signal.throwIfAborted();
    result = await read(
      { ...owned.row.options, signal },
      (phase, counts = {}) => save({ phase, ...counts })
    );
    signal.throwIfAborted();
    const snapshot = await saveExperienceDocument(store, result.document, {
      kind: 'linkedin-native',
      requestId: owned.row.requestId,
      browserSlot: 'linkedin-experience',
      files: result.files,
    });
    saved = true;
    await save({
      phase: 'completed',
      revision: snapshot.revision,
      files: result.files,
    });
  } catch (error) {
    await save({
      phase: owned.controller.signal.aborted ? 'stopped' : 'failed',
      code: /^cv-linkedin-[a-z-]+$/u.test(error.code ?? '')
        ? error.code
        : 'cv-linkedin-unavailable',
    });
  } finally {
    if (result && !saved) {
      await result.discard();
    }
  }
};

/** Read-only recovery never restarts work. Every progress state is acknowledged. */
export const createLinkedinExperienceService = ({
  store,
  artifactRoot = path.join(defaultStoreDir(), 'experience-exports'),
  read = createLinkedinExperienceReader({ store, artifactRoot }),
}) => {
  const service = new PrivateCvJob({
    store,
    key: linkedinExportKey,
    optionsFor: linkedinExportOptions,
    newRecord: newLinkedinExport,
    checked: checkedLinkedinExport,
    view: linkedinExportView,
    failure: linkedinExportFailure,
    work: exportWork(store, read),
  });
  return {
    ...service.controls(),
    evidence: async ({ requestId, name }) =>
      readLinkedinEvidence(
        artifactRoot,
        await service.status({ requestId }),
        name
      ),
  };
};
