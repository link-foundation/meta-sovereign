/** Status reads may recover; acquisition mutations are issued exactly once. */
export const createVkTokenApi = ({ serverFetch, serverResponse }) => ({
  vkTokenStatus: (signal) =>
    serverFetch('/api/vk/token', { signal }, { recover: false }),
  vkTokenAction: async (action, input, signal) => {
    if (!['start', 'import', 'cancel'].includes(action)) {
      throw new Error('invalid VK token action');
    }
    const response = await serverResponse(
      `/api/vk/token/${action}`,
      {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
      { network: true, recover: false }
    );
    return response?.json();
  },
});
