export async function commitReleaseVersion($, version) {
  // The installed command-stream tag preserves each interpolation as one argument.
  await $`git commit -m ${version}`;
}

// Adapted from the template's push-failure-classifier: rules take precedence
// over a non-fast-forward phrase. Only a proven lost race can be retried.
export function isVersionPushRace(error) {
  const output = [error?.stdout, error?.stderr].join('\n').toLowerCase();
  if (
    /gh006|gh013|repository rule|protected branch|push declined|permission denied|authentication failed/.test(
      output
    )
  ) {
    return false;
  }
  return (
    /non-fast-forward|fetch first/.test(output) ||
    /cannot lock ref 'refs\/heads\/main': is at [a-f0-9]+ but expected [a-f0-9]+/.test(
      output
    )
  );
}

export async function retryVersionPush(
  prepareAndPush,
  { log = console.warn } = {}
) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await prepareAndPush(attempt);
    } catch (error) {
      if (!isVersionPushRace(error) || attempt === 3) {
        throw error;
      }
      log(
        `::warning::Version push lost a race (attempt ${attempt}/3); fetching main, revalidating source and recomputing metadata before retry.`
      );
    }
  }
}
