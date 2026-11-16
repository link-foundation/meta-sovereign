import React, { useEffect, useState } from 'react';
import { resumeExportResult } from '../jobs/resume-export-result.js';

const el = React.createElement;
const experienceChoice = (row, t) => {
  if (
    typeof row?.revision !== 'string' ||
    !/^[a-f\d]{64}$/u.test(row.revision) ||
    !['hh', 'linkedin'].includes(row.platform) ||
    !['en', 'ru'].includes(row.source?.language) ||
    !Number.isFinite(Date.parse(row.source?.capturedAt))
  ) {
    return null;
  }
  return {
    id: `experience:${row.revision}`,
    label: `${t('cvPublish.experienceSource')} · ${row.platform === 'hh' ? 'HH' : 'LinkedIn'} · ${row.source.id} · ${row.source.language} · ${row.source.capturedAt} · ${row.revision.slice(0, 12)}`,
    snapshot: {
      hash: row.revision,
      experienceRevision: row.revision,
      sha256: row.revision,
      savedAt: row.source.capturedAt,
    },
  };
};
const exportChoice = (raw, browserSlot, t) => {
  try {
    const row = resumeExportResult(raw);
    if (row.browserSlot !== browserSlot) {
      return null;
    }
    return {
      id: `${row.exportId}:${row.hash}`,
      label: `${t('cvPublish.exportSource')} · ${row.title} · ${row.language} · ${row.capturedAt}`,
      snapshot: {
        hash: row.hash,
        exportId: row.exportId,
        sha256: row.files.find((file) => file.name === 'resume.json').sha256,
        savedAt: row.capturedAt,
      },
    };
  } catch {
    return null;
  }
};

/** Receipt metadata chooses the source; the server verifies private bytes. */
export const useCvPublicationSource = ({
  snapshot,
  exports = [],
  experiences = [],
  browserSlot,
  receipt,
  busy,
  t,
}) => {
  const [selected, setSelected] = useState('owner');
  useEffect(() => {
    setSelected(
      receipt?.experienceRevision
        ? `experience:${receipt.experienceRevision}`
        : receipt?.exportId
          ? `${receipt.exportId}:${receipt.resumes[0]}`
          : 'owner'
    );
  }, [receipt?.requestId, receipt?.exportId, receipt?.experienceRevision]);
  const choices = [
    ...(snapshot
      ? [{ id: 'owner', label: t('cvPublish.ownerSource'), snapshot }]
      : []),
    ...exports.map((row) => exportChoice(row, browserSlot, t)).filter(Boolean),
    ...experiences.map((row) => experienceChoice(row, t)).filter(Boolean),
  ];
  const choice = choices.find((row) => row.id === selected) ?? choices[0];
  const picker =
    exports.length || experiences.length
      ? el('label', { className: 'chat-form-field' }, [
          el('span', { key: 'label' }, t('cvPublish.source')),
          el(
            'select',
            {
              key: 'input',
              value: choice?.id ?? '',
              disabled: busy || !choices.length,
              onChange: (event) => setSelected(event.target.value),
              'data-cv-publication-source': true,
            },
            choices.map((row) =>
              el('option', { key: row.id, value: row.id }, row.label)
            )
          ),
        ])
      : null;
  return { source: choice?.snapshot, picker };
};
