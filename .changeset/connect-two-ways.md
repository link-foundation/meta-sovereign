---
'meta-sovereign': minor
---

Connections: two separate ways to connect, and aligned layouts.

- Every service card has "Import with browser" (recommended) and
  "Enter manually" as two full-width buttons pinned to the card's
  foot, so they line up across a row.
- A service page shows the two routes as tabs; the address keeps the
  tab (`#conn-<service>` or `#conn-<service>/manual`) across reloads.
- The tutorial's "Pick a service" step lights the whole grid and
  explains both routes, with its card above the grid instead of over
  it; the next step points at whichever tab is open.
- Fixed in WebKit: the tutorial card could stay in the corner of the
  screen when Next opened a service page.
- Alignment across the app: browser sign-in rows fill their cells with
  the checkbox on the first line, text fields are as tall as selects
  and buttons, checkboxes share one size, table cells share a
  baseline, key/value tables stay full width and commands wrap on
  phones, and the Automation hint and cards line up.
