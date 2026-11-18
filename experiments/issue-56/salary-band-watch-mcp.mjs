async (page, input) => {
  await page.waitForFunction(() => Boolean(globalThis.__msApi));
  return page.evaluate(async (request) => {
    const api = globalThis.__msApi;
    const review = await api.inspectBrowserAnswer(request);
    const watch = await api.startBrowserAnswerWatch({
      id: `question-watch:${globalThis.crypto.randomUUID()}`,
      review: review.id,
      confirm: true,
      durationMs: 60000,
    });
    let status = watch;
    try {
      for (let attempt = 0; attempt < 80; attempt++) {
        status = await api.browserAnswerWatchStatus({ id: watch.id });
        if (['sent', 'review'].includes(status.phase)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!['sent', 'review'].includes(status.phase)) {
        throw new Error(`Watch did not settle: ${JSON.stringify(status)}`);
      }
      return {
        phase: status.phase,
        before: status.phase === 'review',
        option: status.selection?.option ?? null,
        receipt: status.outbox?.receipt ?? null,
        salary: status.last?.plan?.salary,
      };
    } finally {
      await api.stopBrowserAnswerWatch({ id: watch.id });
    }
  }, input);
};
