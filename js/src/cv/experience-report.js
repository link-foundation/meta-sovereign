/** Read-only Markdown report; original values stay visible beside each other. */
export const formatExperienceComparison = (comparison) => {
  if (!comparison) {
    return '';
  }
  if (comparison.status !== 'compared') {
    return 'Experience comparison unavailable: review the companies and dates in both snapshots.\n';
  }
  const lines = [
    '# HH / LinkedIn experience comparison',
    '',
    `As of ${comparison.asOf}. Review only; no provider changes are authorized.`,
    '',
    `Paired: ${comparison.pairs.length}; HH only: ${comparison.onlyLeft.length}; LinkedIn only: ${comparison.onlyRight.length}; review: ${comparison.review.length}.`,
  ];
  const record = (label, value) => {
    lines.push(
      '',
      `## ${label}`,
      '',
      '```json',
      JSON.stringify(value, null, 2),
      '```'
    );
  };
  for (const pair of comparison.pairs) {
    record(`HH ${pair.leftIndex + 1} / LinkedIn ${pair.rightIndex + 1}`, {
      hh: pair.left,
      linkedin: pair.right,
      differences: pair.differences,
    });
  }
  for (const item of comparison.onlyLeft) {
    record(`HH only ${item.index + 1}`, item.job);
  }
  for (const item of comparison.onlyRight) {
    record(`LinkedIn only ${item.index + 1}`, item.job);
  }
  for (const item of comparison.review) {
    record(`Review ${item.side} ${item.index + 1}: ${item.reason}`, item);
  }
  return `${lines.join('\n')}\n`;
};
