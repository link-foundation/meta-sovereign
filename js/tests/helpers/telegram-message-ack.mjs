// Offline Telegram acknowledgement tied to the exact request's random_id.
export const messageAck = (request, id = 1) => ({
  className: 'Updates',
  updates: [{ className: 'UpdateMessageID', randomId: request.randomId, id }],
});
