/** VK private peers identify users; communities and group peers do not. */
export const vkSafetyTarget = (peer) => {
  const id = Number(peer);
  return {
    source: 'vk',
    chat: String(peer),
    ...(Number.isSafeInteger(id) && id > 0 && id < 2000000000
      ? { contact: String(id) }
      : {}),
  };
};
