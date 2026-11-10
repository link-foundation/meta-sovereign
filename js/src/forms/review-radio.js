const nativeRadio = (field) => field.tag === 'input' && field.type === 'radio';
const groupKey = (field) => `${field.frame}:${field.radioGroup?.id}`;

const reviewedPeers = (field, fields) => {
  if (
    !nativeRadio(field) ||
    field.answer?.proposal?.checked !== true ||
    !field.radioGroup?.complete
  ) {
    return null;
  }
  const peers = fields.filter(
    (entry) => nativeRadio(entry) && groupKey(entry) === groupKey(field)
  );
  if (
    peers.length !== field.radioGroup.size ||
    peers.some(
      (entry) =>
        entry.disabled ||
        entry.readOnly ||
        entry.indeterminate ||
        entry.valueOmitted ||
        entry.radioGroup.size !== peers.length ||
        !entry.radioGroup.complete ||
        entry.answer?.proposal?.checked !== (entry.id === field.id)
    )
  ) {
    return null;
  }
  return peers;
};

/** Review the complete native group, including the option a browser will clear. */
export const withRadioReview = (plan) => ({
  ...plan,
  fields: plan.fields.map((field) => {
    const peers = reviewedPeers(field, plan.fields);
    return peers
      ? {
          ...field,
          answer: {
            ...field.answer,
            radioPeers: peers.map((peer) => peer.id),
            effects: peers
              .filter((peer) => peer.id !== field.id && peer.checked)
              .map((peer) => ({
                fieldId: peer.id,
                label: peer.label,
                checked: false,
              })),
          },
        }
      : field;
  }),
});

export const reviewTargetFields = (fields, writable) => {
  const ids = new Set(
    fields
      .filter(writable)
      .flatMap((field) => [field.id, ...(field.answer.radioPeers ?? [])])
  );
  return fields.filter((field) => ids.has(field.id));
};
