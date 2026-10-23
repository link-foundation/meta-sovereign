---
'meta-sovereign': patch
---

The store no longer runs out of memory on a large log: ids and names read from `data.lino` are copied out of their lines (a slice kept each whole line alive, 6.5 GB for a 2.7 GB log), the snapshot worker gets the parent's heap limit, and the log is compacted when superseded text outweighs the live text, not only when superseded lines outnumber the live links — one sync record written 150,000 times had grown it by a gigabyte.
