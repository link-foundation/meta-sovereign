# Hosted macOS capacity and supported native pool choice

Retrieved 2026-10-28. Primary source: https://docs.github.com/en/actions/reference/runners/github-hosted-runners

GitHub documents standard macos-15-intel as native Intel (4 CPUs, 14 GB RAM), and macos-15 as native ARM (3 M1 CPUs, 7 GB RAM). Both are available as standard public-repository runners. The runner label is pinned, rather than mutable latest.

Evidence: run 40714282555 Node/macOS and run 40718185645 Node/macOS plus WebKit have no executed steps and hosted-runner acquisition/capacity annotations. These are allocation failures rather than failed test assertions. Retrying the same ARM pool reproduced the failure.

Choice: only Node/macOS and WebKit move to the Intel pool. The existing Cartesian 3x3 runtime/OS matrix is retained with one include override; Bun/Deno and desktop continue native ARM coverage. Both browser engines retain the identical full manifest and mandatory terminal dependencies. Pool allocation and successful execution must be confirmed in fresh CI.
