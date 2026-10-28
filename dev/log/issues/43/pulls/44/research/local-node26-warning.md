# Local probe runtime limit

The final offline Telegram class-identity probe runs under the container's Node 26.12.1 and confirms sameApi=true / layer 232. Importing the third-party client also reads Node 26's experimental localStorage getter and emits its no-storage-file warning. This is preserved in local/final-telegram-resolution.log, not suppressed or represented as a CI failure: the supported CI Node target is pinned 24.x and its actual successful logs are reviewed independently. No user application or storage file is opened by this offline class-identity probe.
