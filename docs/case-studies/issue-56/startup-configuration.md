# Layered CLI server startup configuration

The desktop configuration audit found that `serve` parsed explicit command
options but never loaded a global or local application configuration file.
The finite actual-dispatch probe imports the exact `36ee8ba8` command runner
and supplies private temporary global/local Lino files. It observes neither
port nor verbosity and fails. The corrected runner observes the local port
9200 and false verbosity without opening a store, server or provider.

```sh
node experiments/issue-56/startup-configuration.mjs --before
node experiments/issue-56/startup-configuration.mjs
node --test --test-concurrency=1 js/tests/startup-configuration.test.js js/tests/lino-cli-arguments.test.js js/tests/cli-help-imports.test.js js/tests/cli-startup-imports.test.js
```

`serve` now lazily loads the actual `lino-objects-codec` readable parser.
Global user settings yield to local app-folder settings and then explicit
arguments. Missing implicit files are optional; selected files are required.
Each read is bounded to 64 KiB plus one byte, including a growing file.
Only documented nonsecret server fields are accepted, with domain validation.
URL credentials, query strings and fragments refuse. Filesystem and parser
exceptions are replaced by a generic scope message, without supplied values
or private paths. Help and version never read configuration; argument arrays
and process environment remain unmodified. Data-store selection does not
relocate the user's global file.

Six configuration cases cover precedence, false/zero values, selected paths,
missing files, malformed/oversized input, unsupported credential fields,
numeric bounds, URL credentials, directory refusal, identical paths, command
dispatch and help/version bypass. Fifteen configuration, parser and import-boundary checks pass with one test
file at a time. The first lint invocation omitted the
repository's explicit config path; the retained log records that invocation
error. Corrected strict lint uses `--config js/eslint.config.js`. Hosted CI
owns the runtime/platform matrix.

The finite codec exploration retains the installed package's nested-list
round trip and rejects unsupported inline nesting. That syntax investigation
does not establish legacy-list compatibility for every automation setting.
The [user guide](../../SERVER-CONFIGURATION.md) documents supported startup
fields and precedence. Desktop file consumption, runner policies, shared
configuration editing and VD07 remain unfinished; all 60 unchecked inventory
criteria remain required in PR57.

Evidence: [archive](data/startup-configuration.tar.gz),
[hash manifest](data/startup-configuration.tar.sha256.json).
