### DEP0190: Passing `args` to `node:child_process` `execFile`/`spawn` with `shell` option

<!-- YAML
changes:
  - version: v24.0.0
    pr-url: https://github.com/nodejs/node/pull/57199
    description: Runtime deprecation.
  - version:
    - v23.11.0
    - v22.15.0
    pr-url: https://github.com/nodejs/node/pull/57389
    description: Documentation-only deprecation.
-->

Type: Runtime

When an `args` array is passed to [`child_process.execFile`][] or [`child_process.spawn`][] with the option
`{ shell: true }` or `{ shell: '/path/to/shell' }`, the values are not escaped, only space-separated,
which can lead to shell injection.

