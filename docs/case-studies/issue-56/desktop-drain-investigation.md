# Packaged macOS shutdown investigation

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The exact `802c6168` [macOS packaged launch](https://github.com/link-foundation/meta-sovereign/actions/runs/44244114634/job/134599326077)
fails `packaged runtime must finish draining` at log lines 1234–1241. HTTP closes
at line 1228, but `jobs_stopped` and `runtime_close_finished` never arrive before
the existing ten-second fixture kill. The loopback update-feed 404 is expected
from this fixture and does not establish the shutdown failure's cause.

The existing optional lifecycle diagnostics now identify pending and settled
runtime services and the nested automation/background owners. Only fixed
internal labels and elapsed times are logged; account contents and error text
are excluded. The default remains silent. Cleanup promises, ordering, the
all-settled barrier and every timeout remain unchanged. Failed cleanup still
settles as a rejection; logging does not acknowledge successful cleanup.

Eleven focused server-release, desktop lifecycle and packaged receipt checks
pass with one worker. The existing controlled shutdown barrier also passes with
diagnostics enabled. The actual macOS timeout's root cause remains unproven;
this is investigation evidence, not a completed fix or criterion acceptance.

The next unmodified `13788383` [macOS packaged build](https://github.com/link-foundation/meta-sovereign/actions/runs/44245555040/job/134603908343)
passes. That establishes a non-reproducing run, not a root cause or repair. The
diagnostics remain available if the original drain failure recurs.
