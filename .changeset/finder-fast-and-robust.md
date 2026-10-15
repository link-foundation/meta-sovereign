---
'meta-sovereign': patch
---

"Find my Telegram sessions" is now fast and reliable. The scan groups discovered credentials from the files alone — no network — so results (your bot tokens and user sessions, grouped by account) appear at once instead of waiting on, or failing because of, slow per-account Telegram verification. The directory walk skips dot-directories and heavy build/dependency trees and dedupes case-variant roots, cutting a full home-folder scan from ~13s to ~4s. The server response helper now refuses to write twice, so a slow handler whose client has given up can no longer crash the whole server with `ERR_HTTP_HEADERS_SENT` (which previously lost the already-discovered results). Online account verification (`getMe` / GramJS) remains available as a separate step rather than blocking the listing.
