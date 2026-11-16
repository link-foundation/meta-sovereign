async (page) => {
  const root =
    '/tmp/gh-issue-solver-resume-01a1bfa4-bdec-7780-9e26-c4c5ae2e7a00-1794478565459';
  const { verifyUnreadLiveCapture } = await import(
    `file://${root}/js/tests/helpers/e2e-unread-live-capture.mjs`
  );
  const result = await verifyUnreadLiveCapture(page.context().browser(), {
    screenshots: `${root}/docs/screenshots/issue-56-unread-live-capture/mcp`,
  });
  if (
    result.outcome !==
    'transient-edits-delivery-drained-before-view-restoration'
  ) {
    throw new Error('The MCP browser did not verify borrowed capture');
  }
  return {
    ...result,
    mechanism: 'MCP browser, actual shared fixture and source',
  };
};
