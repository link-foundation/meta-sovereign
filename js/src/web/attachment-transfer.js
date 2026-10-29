// The browser upload and the provider upload are distinct measured stages.
// Poll only while sending, coalesce reads, and stop on every exit path.
export const transferAttachments = async (api, items, options, report) => {
  const total = items.reduce((sum, item) => sum + (item.file.size || 1), 0);
  let done = 0;
  const tokens = [];
  for (const { file } of items) {
    const size = file.size || 1;
    const answer = await api.telegramUpload(file, {
      onProgress: (part) =>
        report({ stage: 'uploading', value: (done + part * size) / total }),
    });
    if (!answer?.token) {
      return answer ?? { error: 'upload failed' };
    }
    tokens.push(answer.token);
    done += size;
  }
  let stopped = false;
  let timer;
  const poll = async () => {
    try {
      const progress = await api.telegramUploadProgress?.({ tokens });
      if (!stopped && progress?.ok) {
        report({
          stage: progress.progress >= 1 ? 'confirming' : 'sending',
          value: progress.progress,
        });
      }
    } catch {
      // A missed progress update must not retry the send or report failure.
    } finally {
      if (!stopped && api.telegramUploadProgress) {
        timer = globalThis.setTimeout(poll, 500);
      }
    }
  };
  report({ stage: 'sending', value: api.telegramUploadProgress ? 0 : null });
  poll();
  try {
    return await api.telegramSendFiles({ ...options, tokens });
  } finally {
    stopped = true;
    globalThis.clearTimeout(timer);
  }
};
