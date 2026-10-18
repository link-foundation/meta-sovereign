---
'meta-sovereign': patch
---

The server no longer runs out of memory and stops as the store grows
(R-Y37, R-A3). Before this, a store of about 200k messages no longer
opened at all, and while running, every binary snapshot froze the server
for about 18 s (Chat stayed on "Loading...").

- Each link is held in memory once: the binary side (`data.bin`) is now a
  mirror of the text log, not a second decoded copy.
- The text log is read a line at a time, with repeated strings kept once
  (487 MB instead of 1.37 GB for the same store).
- `data.bin` is written by a worker thread from the log, at most once a
  minute (or ten times what the last one took). A snapshot older than the
  log is written again when the store opens.
- The background history download waits while the heap is over 70% full.
- A query copies only the links it matches (22 ms instead of 157 ms on
  that store), and automations read the saved graphs once per change
  instead of once per message: a sync that wrote 558 links had frozen the
  server for about 50 s.
- Connections reads only the saved credentials (`GET /links?prefix=secret:`),
  not every message.
- Chat tries a failed load again instead of waiting for ever, and a read
  the server does not answer in 30 s falls back to local data.
