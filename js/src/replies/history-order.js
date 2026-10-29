const at = (message) => {
  const number = Number(message.timestamp);
  return Number.isFinite(number) ? number : Date.parse(message.timestamp) || 0;
};
const number = (message) => Number(String(message.id).split(':').at(-1)) || 0;
export const historyOrder = (a, b) =>
  at(a) - at(b) || number(a) - number(b) || a.id.localeCompare(b.id);
