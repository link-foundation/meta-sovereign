# Packaged macOS boot check

The existing desktop workflow builds both macOS architectures and validates
the signed application bundles and mounted DMGs. Those inspections do not
prove that the packaged application starts. VD09 remains unfinished in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

The workflow now launches the actual packaged binary matching the hosted
runner's architecture. The finite probe follows the earlier issue 37 launch
experiment, with a temporary store/profile, ephemeral server port and local
404 updater feed. It refuses a checkout, requires exactly one visible window
with context isolation and no Node integration, waits for the rendered shared
app and checks a successful Lino health response with non-degraded storage.
It captures `desktop-launch-macos.png` as a hosted artifact, then requires
the runtime's completed-drain trace and a clean process exit. A ten-second
cleanup fallback kills a stuck owned process and cannot count as success.

The validator's small refusal/positive test and scoped static checks pass
locally. No local package build or application launch was run. The
[plan](desktop-packaged-launch-plan.md) requires the exact-head native hosted
receipt and screenshot before acceptance. This does not prove a Gatekeeper
dialog, macOS 15 manual interaction, native boot on the other CPU or live
provider authorization. The [first-launch instructions](macos-first-launch.md)
separately explain the documented per-application approval path.
