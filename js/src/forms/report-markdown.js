const escaped = (value) =>
  String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~-]/gu, '\\$&');
const line = (name, value) => `${name}: ${escaped(value)}\n`;
const quoted = (value) =>
  escaped(value)
    .split(/\r?\n/u)
    .map((part) => `> ${part}`)
    .join('\n');
const json = (value) => JSON.stringify(value);

const currentValue = (field) => {
  if (field.valueOmitted) {
    return `Omitted (${field.valueOmitted})`;
  }
  if (field.indeterminate) {
    return 'Mixed';
  }
  if (field.checked === null || field.checked === undefined) {
    return field.value;
  }
  return field.checked ? 'Selected' : 'Not selected';
};

const answerMarkdown = (answer) =>
  answer
    ? [
        line('Proposed answer source', answer.source),
        line('Proposed answer', answer.text),
        line('Proposed field value', json(answer.proposal)),
        line(
          'Status / reason',
          `${answer.complete ? 'proposed' : 'open'} / ${answer.reason}`
        ),
        answer.similarity !== undefined && answer.similarity !== null
          ? line('Question similarity', answer.similarity)
          : '',
        line('Saved questions', json(answer.rules ?? [])),
        line('Source evidence', json(answer.evidence ?? [])),
        line(
          'Profile keys / source',
          json({
            keys: answer.profileKeys ?? [],
            source: answer.profileSource ?? null,
          })
        ),
      ].join('\n')
    : line('Answer source', 'Observed current value; no proposal recorded');

const fieldMarkdown = (field, index) => {
  const answer = field.answer ?? field.plannedAnswer;
  return [
    `### ${index + 1}. ${escaped(field.label || field.id).replace(/\r?\n/gu, ' ')}\n`,
    line(
      'Field / frame / type',
      `${field.id} / ${field.frame} / ${field.type}`
    ),
    line('Label source', field.labelSource),
    field.group ? line('Question group', json(field.group)) : '',
    line(
      'Required / disabled / read only',
      json({
        required: field.required,
        disabled: field.disabled,
        readOnly: field.readOnly,
      })
    ),
    field.description ? `${quoted(field.description)}\n` : '',
    line('Current value', currentValue(field)),
    field.displayValue ? line('Displayed value', field.displayValue) : '',
    field.options?.length
      ? line('Choices (observed states)', json(field.options))
      : '',
    field.upload ? line('Attachment metadata', json(field.upload.files)) : '',
    answerMarkdown(answer),
  ]
    .filter(Boolean)
    .join('\n');
};

const inspectionMarkdown = (report) =>
  [
    `## ${escaped(report.title || 'Form report').replace(/\r?\n/gu, ' ')}\n`,
    line('URL', report.url),
    line('Captured', report.capturedAt),
    report.reportFile ? line('Report file', json(report.reportFile)) : '',
    line(
      'Mode / coverage / scope',
      `${report.mode} / ${report.coverage} / ${report.scope}`
    ),
    'Report row IDs belong to this snapshot. Proposals are separate from current values.\n',
    report.reviewPlan ? line('Review plan', report.reviewPlan.id) : '',
    report.outcome ? line('Action outcome', json(report.outcome)) : '',
    report.observation ? line('Observation', report.observation) : '',
    report.navigation
      ? line('Observed page navigation', json(report.navigation))
      : '',
    report.planning
      ? line('Model availability / use', json(report.planning.model))
      : '',
    line('Omissions', json(report.omissions ?? [])),
    line('Frame coverage', json(report.frames ?? [])),
    ...(report.fields ?? []).map(fieldMarkdown),
  ]
    .filter(Boolean)
    .join('\n');

/** Escape untrusted form text instead of creating executable Markdown/HTML. */
export const formReportMarkdown = (report) =>
  report.mode === 'review-journal'
    ? [
        '# Form review checkpoints\n',
        line('Captured', report.capturedAt),
        line('Scope / coverage', `${report.scope} / ${report.coverage}`),
        line('Omitted checkpoints', report.omittedCheckpoints),
        report.monitoring
          ? line('Automatic capture', json(report.monitoring))
          : '',
        'Explicit reads, plans, verified actions and enabled automatic captures are retained within the journal limits. Pages and edits between captures may be missing. This report does not establish submission or learned answers.\n',
        ...report.checkpoints.flatMap((entry) => [
          `# Checkpoint ${entry.sequence}: ${escaped(entry.action)}\n`,
          line('Checkpoint captured', entry.capturedAt),
          inspectionMarkdown(entry.report),
        ]),
      ]
        .join('\n')
        .concat('\n')
    : `# Form inspection and answer provenance\n\n${inspectionMarkdown(report)}\n`;

export const formReportOutput = (format = 'json') => {
  if (!['json', 'markdown'].includes(format)) {
    throw new Error('--format must be json or markdown');
  }
  return format === 'markdown'
    ? formReportMarkdown
    : (report) => JSON.stringify(report, null, 2);
};
