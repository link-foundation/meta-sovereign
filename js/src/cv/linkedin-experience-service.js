import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { saveExperienceDocument } from './experience-store.js';
import { createLinkedinExperienceReader } from './linkedin-experience-reader.js';
import { readLinkedinEvidence } from './linkedin-experience-evidence.js';
import {
  linkedinExportFailure as failure,
  linkedinExportKey as key,
  linkedinExportOptions as optionsFor,
  checkedLinkedinExport as checked,
  linkedinExportView as view,
  newLinkedinExport,
} from './linkedin-experience-record.js';

class LinkedinExperienceService {
  constructor({ store, read }) {
    this.store = store;
    this.read = read;
    this.tail = Promise.resolve();
  }
  serial(work) {
    const next = this.tail.then(work);
    this.tail = next.catch(() => {});
    return next;
  }
  async save(owned, patch) {
    const row = checked({ ...owned.row, ...patch }, owned.row.requestId);
    await saveAcknowledgedRecord(this.store, row);
    owned.row = row;
  }
  async status({ requestId }) {
    const id = resumeExportRequestId(requestId);
    await this.tail;
    const active = this.current?.row.requestId === id;
    const row = active
      ? this.current.row
      : checked(await this.store.get(key(id)), id);
    return view(row, active);
  }
  async cycle(owned) {
    let result;
    let saved = false;
    try {
      const signal = owned.controller.signal;
      signal.throwIfAborted();
      result = await this.read(
        { ...owned.row.options, signal },
        (phase, counts = {}) => this.save(owned, { phase, ...counts })
      );
      signal.throwIfAborted();
      const snapshot = await saveExperienceDocument(
        this.store,
        result.document,
        {
          kind: 'linkedin-native',
          requestId: owned.row.requestId,
          browserSlot: 'linkedin-experience',
          files: result.files,
        }
      );
      saved = true;
      await this.save(owned, {
        phase: 'completed',
        revision: snapshot.revision,
        files: result.files,
      });
    } catch (error) {
      await this.save(owned, {
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
  }
  async start(input) {
    if (this.closing) {
      throw failure('stopped');
    }
    const options = optionsFor(input);
    const prior = await this.store.get(key(options.requestId));
    if (prior) {
      const row = checked(prior, options.requestId);
      if (
        row.options &&
        JSON.stringify(row.options) !== JSON.stringify(options)
      ) {
        throw failure('conflict');
      }
      return view(row, this.current?.row.requestId === options.requestId);
    }
    if (this.current) {
      throw failure('busy');
    }
    const owned = {
      controller: new AbortController(),
      row: newLinkedinExport(options.requestId, options),
    };
    await saveAcknowledgedRecord(this.store, owned.row);
    this.current = owned;
    owned.task = Promise.resolve()
      .then(() => this.cycle(owned))
      .catch(() => {})
      .finally(() => {
        if (this.current === owned) {
          this.current = null;
        }
      });
    return view(owned.row, true);
  }
  async stop({ requestId }) {
    const id = resumeExportRequestId(requestId);
    if (this.current?.row.requestId === id) {
      this.current.controller.abort();
      await this.current.task;
    }
    let row = await this.store.get(key(id));
    if (!row) {
      row = newLinkedinExport(id);
      await saveAcknowledgedRecord(this.store, row);
    }
    return view(checked(row, id), false);
  }
  close() {
    return (this.closing ??= this.serial(async () => {
      this.current?.controller.abort();
      await this.current?.task;
    }));
  }
}

/** Read-only recovery never restarts work. Every progress state is acknowledged. */
export const createLinkedinExperienceService = ({
  store,
  artifactRoot = path.join(defaultStoreDir(), 'experience-exports'),
  read = createLinkedinExperienceReader({ store, artifactRoot }),
}) => {
  const service = new LinkedinExperienceService({ store, read });
  return {
    start: (input) => service.serial(() => service.start(input)),
    status: (input) => service.status(input),
    stop: (input) => service.serial(() => service.stop(input)),
    evidence: async ({ requestId, name }) =>
      readLinkedinEvidence(
        artifactRoot,
        await service.status({ requestId }),
        name
      ),
    close: () => service.close(),
  };
};
