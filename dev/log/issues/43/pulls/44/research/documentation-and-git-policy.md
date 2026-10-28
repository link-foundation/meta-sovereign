# Primary references for final warning fixes

Retrieved 2026-10-28.

- https://doc.rust-lang.org/rustdoc/lints.html#bare_urls documents the warning-by-default bare_urls lint and automatic Markdown links as the correction.
- https://doc.rust-lang.org/cargo/reference/environment-variables.html documents RUSTDOCFLAGS for flags supplied to rustdoc. A workflow-level -D warnings is inherited by all three cargo doc paths; the executable workflow contract enumerates the steps.
- https://git-scm.com/docs/gitattributes documents conversion policy when text/eol attributes are unspecified. The fixture writes LF files; setting core.autocrlf=false locally in that temporary repository prevents inherited global Windows conversion. No actual user/global configuration is edited.

The retained successful API-doc log and isolated Windows-global-policy probe supply concrete before evidence. These are local caller/configuration faults, not upstream tool defects.
