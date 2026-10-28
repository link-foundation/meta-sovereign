The root pre-commit hook currently runs `npx lint-staged` without an explicit configuration. This also occurs at pinned revision `0a3957d8195271829aa3cd5adce58a98fe73be2b`. It becomes a reproducible archive-scope defect when a case study or CI investigation stages another project's package.json with lint-staged tasks: lint-staged intentionally chooses the closest configuration, so the archived tasks run before root ESLint/Prettier ignores can protect the reference files.

Observed downstream: staging the JS template snapshot started its nested ESLint/Prettier tasks and attempted `pipx run --spec shellcheck-py==0.11.0.1 shellcheck`; missing pipx failed the hook. Automatic rollback completed and all 356 preserved reference hashes still matched. An unavailable Python tool is the immediate error, not the cause: installing it would permit the archived task to run.

Minimal reproduction in a disposable checkout with root dev dependencies installed:

```sh
mkdir -p dev/log/reference
cat > dev/log/reference/package.json <<'JSON'
{"lint-staged":{"*.js":"node -e \"process.exit(42)\""}}
JSON
printf '// archived fixture\n' > dev/log/reference/sample.js
git add dev/log/reference/package.json dev/log/reference/sample.js
npx lint-staged --concurrent 1
```

Actual: the nested package is selected and its harmless exit-42 command fails. Expected for an immutable reference archive: only the repository's root policy applies. Root source-ignore patterns cannot disable lint-staged's own config discovery. This is documented lint-staged monorepo behavior, not a defect in lint-staged itself.

Workaround / proposed fix:

```sh
npx lint-staged --config package.json
```

Keep root formatter/linter exclusions for the immutable archive and keep maintained source checks enabled. An explicit config disables discovery. Document this policy so intentional monorepos can choose a different boundary consciously; do not globally disable hooks.

Downstream regression creates its own temporary Git repository with both root and nested configurations. The nested task throws, the root task records checked paths, and the test executes the actual hook argument list with the installed CLI. Before the flag it fails on the nested task; afterward Node and Deno pass and maintained source is still checked. No downloaded template application, real account, user server or network fixture is required.

Regression and detailed evidence: https://github.com/link-foundation/meta-sovereign/pull/44 (issue 43, finding F14; `js/tests/ci-precommit.test.js` and `dev/log/issues/43/pulls/44/local/precommit-{before,after,deno}.log`).

Primary component contract: https://github.com/lint-staged/lint-staged#--config-path — explicit `--config` skips configuration search.
