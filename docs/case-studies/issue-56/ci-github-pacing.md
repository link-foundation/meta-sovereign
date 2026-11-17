# GitHub link-check pacing

The strict link check at published `448c2234` failed in run
[44168812180](https://github.com/link-foundation/meta-sovereign/actions/runs/44168812180).
Its preserved raw log reports **43 errors**, all HTTP 503, covering 32 distinct
GitHub source URLs (summary at line 551; individual entries at lines 558–612).
The earlier `6f7bdd6f` run also rejected valid GitHub pages: all nineteen distinct
URLs returned 200 in a bounded sequential recheck. Eight URLs rejected in the
newer run also pass the actual configured checker. Neither recheck establishes
the remote cause or substitutes for exact-source hosted validation.

The pinned lychee v0.24.2 source has a default 50 ms host interval and ten host
permits. The workflow's four-request global pool still permits GitHub bursts.
Rate pressure is an inference from the changing 503 failures and successful
rechecks, rather than a proven GitHub response-header diagnosis. Serialize
`github.com` and space its requests by 500 ms, leaving other hosts, accepted
statuses, retry settings, exclusions and the strict final failure unchanged.
Pass the configuration explicitly and trigger validation when it changes.

The regression uses the actual released Linux checker, downloaded once with its
release-asset SHA-256 verified. Four finite loopback requests receive 503 when
they arrive less than 450 ms apart; each response holds for 550 ms to expose
concurrency. No user application or public service supplies the fixture.

```sh
python3 -B experiments/issue-56/lychee-host-pacing.py /path/to/lychee
```

With an empty parent-equivalent configuration, **one of four checks fails**:
the intended successful check instead receives three 503 responses, around
50 ms apart and with four overlapping requests. With the saved host settings,
**all four checks pass**: four 200 responses, at least 550 ms apart and one
active request; default bursts still reproduce failure; permanent 404 and
503 responses still fail. Each child has a finite deadline, and owned server
threads and temporary files drain before return. This bounded regression runs
in the link workflow against the installed checker as well.

The checked archive contains the original failed log, upstream source snapshots,
asset identity, before/after output, remote rechecks and final workflow/config.
This repairs validation reliability without accepting a failed source link.
All **35 unfinished issue criteria** and exact-source hosted verification remain
required; [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays
draft and unmerged.
