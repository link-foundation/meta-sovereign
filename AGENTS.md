# Validation on the user's machine

Run only specific tests relevant to the changes locally, with limited concurrency. Do not run the full test suite, stress tests, or full runtime/browser matrices locally. Push and review GitHub CI/CD for those checks. Keep the user's running application server separate from test fixtures.

# Product and UI direction

Follow [the product vision](docs/PRODUCT-VISION.md) for UI and messaging work.
Prefer T3 Code as the reference for visual style and configurability, and
Telegram clients as the baseline for common messaging features and interactions
across all providers. Compare relevant pinned sources in
[Chat References](docs/CHAT-REFERENCES.md); learn behavior without copying code.
Apply shared interaction, spacing, selection, loading and recovery rules to
Chat, Operator and every other affected surface. Preserve accurate capability
and delivery states rather than claiming unsupported operations succeeded.
