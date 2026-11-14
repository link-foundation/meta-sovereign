const choiceType = (field) => ['listbox', 'combobox'].includes(field.type);

export const expandableReviewField = (field) =>
  field.type === 'combobox' &&
  field.optionsDisclosure === true &&
  !field.disabled &&
  !field.readOnly &&
  !field.valueOmitted;

export const customChoice = (field) => {
  if (
    !choiceType(field) ||
    field.multiple ||
    !field.optionsComplete ||
    field.options.filter((option) => option.selected).length > 1
  ) {
    return null;
  }
  const matches = field.options.filter(
    (option) => option.value === field.answer?.proposal?.value
  );
  const option = matches.length === 1 ? matches[0] : null;
  return option?.visible &&
    option.clickable &&
    !option.disabled &&
    Number.isInteger(option.index) &&
    option.index >= 0
    ? option
    : null;
};

export const customReviewField = (field) =>
  Boolean(customChoice(field)) ||
  (field.type === 'textbox' && field.custom?.editable === true) ||
  (field.custom?.clickable === true &&
    field.custom.checkedKnown === true &&
    (field.type === 'checkbox' ||
      (field.type === 'radio' &&
        field.answer.proposal.checked === true &&
        field.answer.radioPeers?.length > 0)));

/** Serialized predicates retain the exact option and its reviewed owner. */
export const customOptionAtIndex = (index) =>
  globalThis.document.querySelectorAll('[role="option"]')[index];

export const customOptionBound = (node, { index, controlIndex }) => {
  const doc = node.ownerDocument;
  const control = doc.querySelectorAll(
    'input,textarea,select,[role="textbox"],[role="combobox"],[role="checkbox"],[role="radio"],[role="listbox"],[contenteditable="true"]'
  )[controlIndex];
  return (
    node.isConnected &&
    doc.querySelectorAll('[role="option"]')[index] === node &&
    Boolean(
      control &&
      (control.contains(node) ||
        (control.getAttribute('aria-controls') ?? '')
          .split(/\s+/u)
          .slice(0, 10)
          .some((id) => doc.getElementById(id)?.contains(node)))
    )
  );
};
