/* global Event, HTMLTextAreaElement, HTMLInputElement */

/** Native value notification with an exemption for this exact owned input event. */
export const writeBrowserNativeInput = (node, value, inactive) => {
  const prototype =
    node instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter || !('value' in node)) {
    return false;
  }
  const event = new Event('input', { bubbles: true });
  if (inactive) {
    inactive.ownedInput = event;
  }
  try {
    setter.call(node, value);
    node.dispatchEvent(event);
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return String(node.value) === value;
  } finally {
    if (inactive?.ownedInput === event) {
      delete inactive.ownedInput;
    }
  }
};
