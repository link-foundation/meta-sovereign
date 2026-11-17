# Desktop installation and native launch verification

The complete pinned desktop requirements include actual target-platform smoke
checks and a Windows silent installation that does not launch the app. In
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), the earlier
Windows check only counted two executables and required each to exceed 10 MB.
Linux checked archive contents. Only macOS launched the packaged application.

The existing protected-window, healthy Lino backend and graceful-drain validator
now runs against extracted Linux AppImages and installed Windows applications
on both native architectures. Linux launch uses the CI virtual display and its
existing sandbox exception. Windows installs to a unique runner-owned directory,
checks for an unwanted application process during installation and for two
seconds afterward, then explicitly launches with an isolated profile and store.
Cleanup stops only application processes under that owned directory and runs
its uninstaller. Installation and cleanup have finite bounds; a forced exit is
never a passing launch receipt. Each platform preserves a native screenshot.
The process observation is sampled every 100 ms; it does not claim a kernel
process-event trace of transient children.

The four user guides now use the committed builder lockfile rather than
reinstalling incompatible builder 26. They describe architecture selection,
portable/archive startup, Windows ARM64 manual updates, native macOS/Windows
checksum commands and the release provenance record. Existing checksum-first
per-application macOS Gatekeeper instructions remain available.

Twenty-four relevant portable packaging/launch/cleanup checks pass locally.
Actual Windows installation and Linux/macOS launch checks run on hosted runners;
no installers were built, installed or launched on the user's machine.

For the preceding source `549635f2`, all five desktop jobs passed in
[run 44035649627](https://github.com/link-foundation/meta-sovereign/actions/runs/44035649627).
Authenticated bounded ZIP range reads fetched 5,559 bytes in total from five
artifacts, preserving their small checksum/provenance records and file catalogs.
Their recorded merge commit `88b44f28` has exactly the selected head's tree and
parents default `1dc57835` and head `549635f2`. These are checks of the recorded
metadata and its ZIP CRC, not an independent hash of the large installer bytes.
The release publishing path separately verifies installer checksums.

[Hashed evidence](data/desktop-installation-verification.tar.gz) retains the
prior job/artifact metadata, fetched records, exact merge-tree mapping,
documentation comparison, focused checks and changed sources. All new native
checks must pass on the exact new head before VD09 can be accepted. The full
40 unchecked criteria remain required; PR #57 stays draft and unmerged.
