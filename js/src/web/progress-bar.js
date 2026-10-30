import React from 'react';

export const boundedPercent = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : null;

/** Unknown progress stays unknown; byte transfers never round up to complete. */
export const transferPercent = (fraction) => {
  const percent = boundedPercent(
    typeof fraction === 'number' ? fraction * 100 : null
  );
  if (percent === null) {
    return null;
  }
  // Correct binary floating-point noise (0.29 * 100), while reserving
  // 100% for a measured complete transfer.
  return fraction < 1 ? Math.min(99, Math.floor(percent + 1e-9)) : 100;
};

export const countPercent = (done, total) =>
  Number.isFinite(done) && Number.isFinite(total) && total > 0
    ? boundedPercent(Math.round((done / total) * 100))
    : null;

export const ProgressBar = ({
  percent,
  label,
  className = '',
  fillClassName = '',
}) => {
  const value = boundedPercent(percent);
  return React.createElement(
    'div',
    {
      className: `progress-track ${className}`.trim(),
      role: 'progressbar',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': value ?? undefined,
      'data-progress': value === null ? 'indeterminate' : 'determinate',
    },
    React.createElement('span', {
      className: `progress-fill ${fillClassName}`.trim(),
      style: value === null ? undefined : { width: `${value}%` },
    })
  );
};
