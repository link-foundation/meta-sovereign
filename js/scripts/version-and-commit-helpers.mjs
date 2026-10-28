export async function commitReleaseVersion($, version) {
  // The installed command-stream tag preserves each interpolation as one argument.
  await $`git commit -m ${version}`;
}
