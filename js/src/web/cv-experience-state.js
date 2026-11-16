import {
  validateExperienceDocument,
  experienceDocumentToLino,
  experienceDocumentFromLino,
} from '../cv/experience-document.js';
import { LINO_TEXT, LINO_BINARY } from '../transport/lino.js';

const revision = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export const experienceExportKey = (item) =>
  `${item.browserSlot}:${item.exportId}:${item.hash}`;
export const experienceFileDocument = async (file) => {
  if (
    !file ||
    !Number.isSafeInteger(file.size) ||
    file.size > 4 * 1024 * 1024
  ) {
    throw new Error('Choose a structured experience file of at most 4 MiB.');
  }
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== file.size) {
    throw new Error('The experience file changed.');
  }
  return file.name.endsWith('.json')
    ? validateExperienceDocument(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      )
    : experienceDocumentFromLino(
        bytes,
        file.name.endsWith('.bin') ? LINO_BINARY : LINO_TEXT
      );
};
const receipt = (value) => {
  if (
    !revision(value?.revision) ||
    !['imported', 'hh-export', 'linkedin-native'].includes(
      value.provenance?.kind
    )
  ) {
    throw new Error('Snapshot acknowledgement is incomplete.');
  }
  return { ...value, document: validateExperienceDocument(value.document) };
};
const selectLinkedinRevision = async (api, id) => {
  const answer = receipt(await api.cvExperienceDocument(id));
  if (answer.revision !== id || answer.document.platform !== 'linkedin') {
    throw new Error('The exported snapshot was not confirmed.');
  }
  return answer;
};
export const downloadExperienceDocument = (document, revisionId, type) => {
  const bytes = experienceDocumentToLino(document, type);
  const href = URL.createObjectURL(new globalThis.Blob([bytes], { type }));
  const anchor = globalThis.document.createElement('a');
  anchor.href = href;
  anchor.download = `experience-${document.platform}-${revisionId}.${type === LINO_BINARY ? 'bin' : 'lino'}`;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(href), 1000);
};
const initialState = () => ({
  entries: null,
  exports: null,
  truncated: false,
  catalogueConfirmed: false,
  file: null,
  choices: { hh: '', linkedin: '' },
  exportKey: '',
  busy: false,
  error: false,
  receipt: null,
  comparison: null,
});
/** One admitted action at a time. Failed reads retain the last acknowledged catalogue. */
export const createExperienceState = (
  api,
  changed,
  download = downloadExperienceDocument
) => {
  let live = true;
  let state = initialState();
  const update = (patch) => {
    state = { ...state, ...patch };
    if (live) {
      changed(state);
    }
  };
  const run = async (work) => {
    if (!live || state.busy) {
      return false;
    }
    update({ busy: true, error: false });
    try {
      await work();
      return true;
    } catch {
      update({ error: true });
      return false;
    } finally {
      update({ busy: false });
    }
  };
  const remember = (answer) => {
    const row = receipt(answer);
    const { platform, source, jobs } = row.document;
    const entry = {
      revision: row.revision,
      platform,
      source,
      jobs: jobs.length,
      provenance: row.provenance.kind,
    };
    update({
      receipt: row,
      entries: [
        entry,
        ...(state.entries ?? []).filter((old) => old.revision !== row.revision),
      ].slice(0, 100),
      choices: { ...state.choices, [platform]: row.revision },
      comparison: null,
    });
  };
  return {
    get: () => state,
    dispose: () => {
      live = false;
    },
    choose: (platform, value) => {
      if (!state.busy && ['hh', 'linkedin'].includes(platform)) {
        update({
          choices: { ...state.choices, [platform]: value },
          comparison: null,
        });
      }
    },
    file: (file) => {
      if (!state.busy) {
        update({ file });
      }
    },
    exportKey: (exportKey) => {
      if (!state.busy) {
        update({ exportKey });
      }
    },
    reload: () =>
      run(async () => {
        const [catalogue, native] = await Promise.all([
          api.cvExperienceStored(),
          api.cvExperienceExports(),
        ]);
        if (
          !Array.isArray(catalogue.entries) ||
          catalogue.entries.length > 100 ||
          !Array.isArray(native.exports) ||
          native.exports.length > 100
        ) {
          throw new Error('Snapshot catalogue was not confirmed.');
        }
        update({
          entries: catalogue.entries,
          catalogueConfirmed: true,
          truncated: catalogue.truncated === true,
          exports: native.exports,
        });
      }),
    import: () =>
      run(async () =>
        remember(
          await api.cvExperienceImport({
            document: await experienceFileDocument(state.file),
          })
        )
      ),
    selectRevision: (id) =>
      run(async () => remember(await selectLinkedinRevision(api, id))),
    fromHh: () =>
      run(async () => {
        const selected = state.exports?.find(
          (item) => experienceExportKey(item) === state.exportKey
        );
        if (!selected) {
          throw new Error('Choose an acknowledged HH export.');
        }
        remember(
          await api.cvExperienceFromHh({
            exportId: selected.exportId,
            hash: selected.hash,
            browserSlot: selected.browserSlot,
          })
        );
      }),
    compare: () =>
      run(async () => {
        const choices = { ...state.choices };
        if (!revision(choices.hh) || !revision(choices.linkedin)) {
          throw new Error('Choose two snapshots.');
        }
        const answer = await api.cvExperienceCompare(choices);
        if (
          answer.hh !== choices.hh ||
          answer.linkedin !== choices.linkedin ||
          answer.comparison?.status !== 'compared'
        ) {
          throw new Error('The compared revisions were not confirmed.');
        }
        update({ comparison: answer });
      }),
    download: (platform, type) =>
      run(async () => {
        const selected = state.choices[platform];
        const answer = receipt(await api.cvExperienceDocument(selected));
        if (
          answer.revision !== selected ||
          answer.document.platform !== platform
        ) {
          throw new Error('The downloaded revision was not confirmed.');
        }
        download(answer.document, answer.revision, type);
      }),
  };
};
