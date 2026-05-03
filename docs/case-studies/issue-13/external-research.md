# External research for issue #13

This issue depends on the lifetime of browser storage and React
component state.

## Browser persistence

MDN documents that
[`window.localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
is scoped to a document origin and saved across browser sessions.
MDN's
[Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
reference states the same origin gets the same `localStorage` area and
that it persists when the browser is closed and reopened.

This makes `localStorage` the correct existing persistence surface for
the tutorial preference. The existing key,
`metaSovereignTutorial`, already stored the off preference there; PR
#14 extends the same value with a `stepId` progress field.

## React state lifetime

React's
[Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state)
guide explains that component state is tied to a component's position
in the render tree. That state is not durable across a full page
reload because the JavaScript runtime and component tree are rebuilt.

React's
[`useEffect` reference](https://react.dev/reference/react/useEffect)
frames effects as a way to synchronize a component with an external
system. In this case, the browser's Web Storage API is the external
system. PR #14 uses synchronous event handlers for writes and a mount
/ open-time read to synchronize the overlay with stored progress.

## Implementation conclusion

The durable source of truth should be a stable step id, not a numeric
index alone. A step id remains meaningful if the step list grows, while
an index can point to the wrong step after reordering. Unknown or
malformed stored progress safely falls back to step 1.
