# Packaged desktop launch verification

VD09 requires working desktop artifacts as well as installation instructions.
The existing CI smoke steps inspect formats, signatures and mounted DMGs, but
do not start the packaged application. Keep every original requirement active
in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

- [x] Read the existing release workflow, signing helper, packaged entry point,
      lifecycle and issue 37 launch probe. Separate package inspection from a
      successful renderer and backend launch.
- [x] Add one finite native macOS packaged launch to the hosted workflow, with
      a throwaway store/profile and local updater feed. Require the packaged
      single window, protected preferences, rendered app, positive Lino health
      and graceful exit. Retain a screenshot as an artifact.
- [x] Run focused refusal checks and scoped static checks locally. Keep actual
      desktop launches and platform builds on hosted runners.

The validator rejects a checkout, an unready backend and degraded storage;
its positive case passes. The native launch also waits for a visible renderer
and the runtime's completed-drain trace, and rejects forced process exit.
These local checks do not establish native macOS launch success.

- [ ] Publish this atomic verification step, inspect its exact-head job and
      preserve the native receipt and screenshot before accepting VD09.

This does not claim a Gatekeeper dialog, macOS 15 manual interaction, native
launch on another CPU, live provider authorization or authenticated parity.
