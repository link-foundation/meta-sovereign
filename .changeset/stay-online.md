---
'meta-sovereign': patch
---

R-Y65, R-Y66: the app stays online and keeps loading. One slow read no longer takes it offline while the server answers; the open chat asks for its messages again until they come; the local copy reloads itself when its server comes back with a new build, and keeps looking for a server it did not find; a stuck Telegram request reconnects at once. Every avatar shows: group members' photos are read by their message (GramJS failed that lookup, and the failure was remembered as "no photo" for a day), failed downloads are retried, and a photo still downloading no longer holds one of the browser's few connections.
