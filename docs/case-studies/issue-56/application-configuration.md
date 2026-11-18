# Saved native survey configuration for foreground reviews

Single and batch foreground application reviews now resolve the native survey
setting through the installed `lino-arguments` library. The published parent
`21b7afcbaa3a574ed2df02576f7c6da0dec57932` accepts only the explicit negative
flag; a saved `AUTO_ANSWER_VIEWED_VACANCY: false` does not disable its observer.

Use either explicit CLI flag, or save the reference's setting in `.lenv`:

```text
AUTO_ANSWER_VIEWED_VACANCY: false
```

Resolution follows the library's isolated-context precedence:

1. `--auto-answer-viewed-vacancy=true|false` or
   `--no-auto-answer-viewed-vacancy=true|false` (choose one).
2. The `AUTO_ANSWER_VIEWED_VACANCY` process environment variable.
3. A Lino environment file selected by `--configuration=<path>`.
4. `.lenv` in the current working directory.
5. The existing enabled default.

Paths are relative to the working directory. Missing optional Lino environment
files retain the library's empty-file behavior. Mapped booleans accept
`true`/`false` without case sensitivity and `1`/`0`; explicit flags retain the
CLI's `true`/`false` syntax. Invalid mapped values refuse before opening a store
or browser and errors omit their supplied values. Unrelated environment keys
are not application options. Resolution never exports file settings into
`process.env`, reads secret files or changes the process working directory.

The reference README/configuration at pinned
`fa0991b8c2d0896fb3b4be6c69947f0590094b15` establishes the setting, opt-out and
selected-file support. We intentionally use the installed library's isolated
API: environment values take precedence over files, whereas its legacy process
exporter mutates the host environment and lets files override it. The ordering
is explicit in CLI help. This adds configuration only for this survey setting;
other reference settings still require their own implementation and evidence.

Only an explicit start resolves configuration. Its result is frozen in the
existing single/batch settings and receipts. Status ignores even invalid start
flags/configuration, returns the acknowledged policy and never resumes an
observer or worker. The library imports lazily during start and is now a pinned
production dependency; help and unknown-command admission retain their small
import boundary.

## Reproduction and verification

Run `python3 -B experiments/issue-56/application-configuration-before.py`.
The exact published parent fails the single and batch saved-policy cases; the
two configuration-library checks pass independently. Working sources and the
existing bundle are restored afterward. The corrected implementation passes
13 focused Node checks and four Deno checks. Coverage includes default/file/
environment/explicit precedence, invalid value privacy, preserved host
environment, frozen single/batch receipts, closure, zero submissions and
read-only status. Existing survey controls and lightweight help admission are
included in the Node check. A package dry run includes the new resolver and
`npm ls --omit=dev` confirms its production dependency.

The [checked source/log archive](data/application-configuration.tar.gz) and
[per-file hashes](data/application-configuration.tar.sha256.json) retain the
parent regression, installed-library documentation, pinned reference evidence,
focused checks and packaging receipts. Runtime/browser matrices remain in CI.

## Native viewed-state exclusion remains unfinished

An anonymous read-only HH search snapshot contains 20 cards. Every title link
has `magritte-link_enable-visited` styling, so that class cannot prove that an
individual vacancy was viewed. It is not used as a skip marker. The pinned
reference also tracks processed IDs within its worker, which is distinct from
a verified native viewed state. The public snapshot and source observations
are retained as research; authenticated viewed-state exclusion still needs
positive provider evidence and implementation.

HH05, HH08 and all 81 original incomplete inventory rows remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
