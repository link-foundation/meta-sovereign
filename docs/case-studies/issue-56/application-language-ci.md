# Application language controller fixture correction

The Checks and release run for `7c0a9aef5c7f1fde93272bb34024dd4bb112c9e2`
started at 2026-11-14T10:41:46Z. Its macOS Bun, Windows Bun and Windows
Deno shard 2 jobs independently reported the same five controller failures.
The error was `jobs-application-changed` from `ApplicationFullForm.open`.
The archived macOS Bun job log identifies the supervised controller failure
at lines 10049–10064 and lists all five failing scenarios at 10963–10968.
The Windows Deno shard log gives the five fixture locations at 5122–5167.

These fixtures selected an identity, then started their review with options
that omitted the new language setting. Selecting an identity deliberately
does not retain application options in browser storage. The fixtures therefore
inherited the new automatic language policy, while their synthetic native
pages implemented only direct entry. The shared controller fixture now
explicitly opts out at the `open` boundary. An explicit caller value still
takes precedence. Production defaults and admission checks are unchanged.

Validation: the five affected controller files pass together, 26 tests each on Node, Deno and Bun; Node used concurrency one. Dedicated language service, route and browser scenarios
continue to cover the default full-form path. Original failure logs and the
focused follow-up log are retained in the ignored `ci-logs` directory.

Work remains tracked in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57);
this correction does not complete the original issue inventory.
