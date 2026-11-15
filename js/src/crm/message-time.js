// VK imports use Unix seconds; local receipts and archives also use ISO dates
// and milliseconds. Compare the same instant while retaining original bytes.
export const messageTime = (value) => {
  if (
    !['number', 'string'].includes(typeof value) ||
    String(value).trim() === ''
  ) {
    return NaN;
  }
  const number = Number(value);
  const milliseconds = Number.isFinite(number)
    ? number < 1e12
      ? number * 1000
      : number
    : Date.parse(value);
  return Number.isFinite(milliseconds) && Math.abs(milliseconds) <= 8.64e15
    ? milliseconds
    : NaN;
};
