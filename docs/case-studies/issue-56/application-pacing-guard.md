# Pacing feedback at native action guards

The first saved-pacing unit (`9a78b6d9`) observes outcomes during explicit page
inspection. A native CAPTCHA or positive delivery can also arrive after that
inspection, immediately before a confirmed action. The existing action guard
correctly refuses the changed page, but the pacing record previously missed the
outcome until another explicit read. This loses feedback when the worker closes
at the refusal.

The guard now offers the same fresh, bound native snapshot to the shared pacing
observer after daily-limit handling and before its unchanged page comparison.
It does not replace the frozen review page, authorize a changed action or read
CAPTCHA content. The existing acknowledged feedback record deduplicates the
later explicit inspection. A simultaneous daily limit retains priority and adds
neither challenge nor delivery pacing feedback. Failed persistence still refuses
before dispatch.

`PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/application-pacing-guard-check.py`
retains exact-parent service and native-browser failures, focused checks and the
native result, restores the built fixture bundle and drains owned resources.
The regression changes native state between initial inspection and an attempted
entry, verifies refusal with zero entry/send clicks, then confirms one saved
feedback observation and no recount on the next read. The native CAPTCHA value
has a throwing getter so an accidental value read fails the scenario.

Pacing now has its own mandatory browser entry, containing the settings/expiry
scenario and the fresh-guard scenario. The existing worker-policy scenario is
restored unchanged. Every original scenario remains registered exactly once in
both engines and all four shards; the existing 180-second group and 35-minute
job deadlines remain. This keeps the roughly one-minute new settings flow from
consuming the original four-scenario draft group's budget.

The first local native attempt used the repository's unchanged bundle and
correctly reported the absent control. The repeat builds the isolated fixture
before running and restores it afterward. This development failure is retained
separately from the actual-parent guard failures.

Focused Node 40 and Deno 35 checks pass, including the existing daily-limit
cases and browser registration checks. Both native Chromium pacing scenarios
pass: the settings/expiry flow takes 68 seconds and fresh native guard feedback
14 seconds. No late-guard entry or Send is issued. Scoped formatting, strict lint,
secret scanning, whitespace and the unchanged duplication gate pass. Source,
exact-parent failures and logs are retained in `data/application-pacing-guard.tar.gz`
with a SHA-256 manifest. Exact-head hosted runtime/browser matrices remain required. This correction
establishes neither full paced batches nor authenticated provider parity. All 81
original incomplete inventory rows remain required; work continues in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), draft and unmerged.
