# Windows packaged-app uninstall race

The first native Windows x64 verification for source `935fbf8e` in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) successfully
installed silently, explicitly launched the actual protected packaged window,
received healthy Lino backend data and drained with exit zero. The job failed
afterward while removing its owned parent directory.

The preserved [job](https://github.com/link-foundation/meta-sovereign/actions/runs/44040104362/job/133892687330)
log records silent installation at line 687 and the positive native launch
receipt at line 759. Lines 760–765 show `Remove-Item` failing because a resource
directory disappeared during enumeration. NSIS copies its uninstaller to a
temporary child; the original process and main executable can disappear while
the child still deletes application resources.

The native ARM64 job reproduces the same cleanup race at lines 785–790 after
its positive launch receipt at line 784. The separate main formatting failure
at lines 543–545 is a missing blank line before the appended case-study index
list. The index now passes the unchanged formatter. Both failed jobs and the
aggregate failure log are retained; lint warnings did not fail that workflow.

The verifier now waits for the complete installation directory to disappear
before removing its unique parent. The existing ten-second bound remains, and
remaining resources still fail verification. The helper only observes the
specified directory; it never removes resources or touches unrelated processes.
Two finite Windows tests exercise actual filesystem removal after the executable
is absent and refusal when resources remain. They run on hosted Windows runtime
partitions. Local Linux verification passes the existing portable receipt check
and explicitly skips those two PowerShell checks; it does not claim a native
Windows result.

[Hashed evidence](data/ci-windows-uninstall.tar.gz) preserves the original full
job log, exact source, positive launch receipt, correction and focused checks.
Both Linux architectures and macOS passed the preceding native desktop jobs.
The corrected Windows installation checks and every exact-head workflow still
need hosted verification. VD09 and all other unchecked criteria remain required;
PR #57 stays draft and unmerged.
