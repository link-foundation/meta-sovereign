// A resolved transport promise alone does not acknowledge a contact change.
export const contactReceipt = (answer) => {
  if (
    !['Updates', 'UpdatesCombined', 'UpdateShort'].includes(answer?.className)
  ) {
    throw Object.assign(new Error('Contact response has no acknowledgement'), {
      ambiguous: true,
    });
  }
  return answer;
};
