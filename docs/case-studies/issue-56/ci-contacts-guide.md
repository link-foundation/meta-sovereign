# Contact guide link recovery

Published `b5999ae503827207b8ffe01d8f11fe80b1109048` link run
[44129087291](https://github.com/link-foundation/meta-sovereign/actions/runs/44129087291)
started on 2026-11-17 at 16:43:56 UTC. Its preserved 745-line log reports two
remote errors: the Apple iCloud Contacts guide returns 404 at lines 404 and
516; the pinned Telegram exporter source returns 503 at lines 494 and 520.
The strict final failure is at lines 687–703.

The exact Apple address still returns 404 in the bounded local recheck. The
checker found its September 21 archive at lines 635 and 645. The contact import
guide now labels and links that exact archived Apple guide, preserving its
vCard export instructions and attribution. No checker rule or exclusion changes.
Apple's current [broader iCloud backup guide](https://support.apple.com/en-us/108306)
also describes vCard export, but unconditional local requests returned 304 with
no body; those responses cannot verify a replacement HTTP page locally.

The unchanged pinned GitHub source returns 200 on recheck and remains readable
through web browsing. Its source revision and line references remain intact.
The earlier 503 establishes a failed remote request, without establishing its
underlying cause. A fresh hosted link run is required; local response status
alone is not a successful repository-wide link check.

The [checked evidence](data/ci-contacts-guide.tar.gz) and
[manifest](data/ci-contacts-guide.tar.sha256.json) retain the original complete
failure, response statuses/headers with Set-Cookie removed, source diff and
collector. No personal profile or provider was accessed. This documentation
repair accepts no additional original criterion: 82 are verified and 36 remain
unfinished in draft [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
