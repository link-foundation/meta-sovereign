/** Native public VK attachment identities; never fetch arbitrary URLs. */
export const vkNativeAttachment = (value) =>
  typeof value === 'string' &&
  /^(photo|audio|video|doc)-?[1-9]\d{0,14}_[1-9]\d{0,14}(?:_[A-Za-z0-9_-]{1,128})?$/u.test(
    value
  );

export const vkNativeAttachments = (input = []) => {
  if (
    !Array.isArray(input) ||
    input.length > 10 ||
    !input.every(vkNativeAttachment)
  ) {
    throw new Error('Up to ten native VK photo/audio/video/doc IDs required');
  }
  return [...new Set(input)];
};
