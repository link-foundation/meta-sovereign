# Audited regex regression digest

Exact source `82ff720216235216d7b747e2671edd43d381d401` failed the
[security run](https://github.com/link-foundation/meta-sovereign/actions/runs/44014091633).
The preserved log reports `js/redos` at `js/tests/server-hardening.test.js:520`
on lines 13752–13755. npm and Cargo audits found no vulnerabilities.

The finding is the deliberately catastrophic, finite regex input in the
existing VM timeout regression. Its audited exception already existed. The
busy-port regression in `086a6eb1` changed another test in the same file and
invalidated that exception's whole-file digest. The risky assertion, production
matcher, input cap and VM budget were unchanged. Reviewing that diff and
rerunning the bounded timeout regression confirms the existing justification.

Refresh only that exact digest. Do not broaden the exception or alter the
CodeQL gate. Replaying the downloaded SARIF fails before the correction and
passes afterward with the same two audited findings. Four focused checks pass,
including the gate's refusal of changed source bytes and missing audit fields.
Hosted verification of the next commit is still required.

Raw logs, SARIF, the exact parent exception and source bytes are preserved in
[the hashed archive](data/ci-codeql-audit-digest.tar.gz). This CI correction
accepts no additional issue #56 feature; forty original criteria remain open.
