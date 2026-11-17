# macOS cleanup trap lint

Exact head `ba17dac9` failed the workflow contract gate in
[run 44028318708](https://github.com/link-foundation/meta-sovereign/actions/runs/44028318708/job/133854350748).
The preserved log `ci-logs/checks-44028318708-133854350748.log`, lines 329–332,
reports ShellCheck SC2329 on `cleanup`, which is invoked indirectly by the
owned image's EXIT trap. The gate stopped before the runtime matrix started.

The function now has a scoped SC2329 annotation explaining that invocation.
ShellCheck 0.11.0 reproduces the diagnostic on the parent and passes both
package scripts after the annotation. All four finite mocked cleanup tests
pass. Their logs use the `ci-macos-trap-call-` prefix. No package verification,
trap behavior, signature check, retry count or workflow deadline changes.

This repairs the CI lint gate only. Full issue acceptance remains unfinished.
