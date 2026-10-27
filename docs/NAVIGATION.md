# Navigation and reloads

The current section is represented in the URL, rather than being initialized to Chat on every load. Reloads, local-server reconnection reloads, and browser Back/Forward preserve that route. The initial render uses the route immediately, without briefly displaying Chat first.

| Destination              | Fragment                                       |
| ------------------------ | ---------------------------------------------- |
| Any menu section         | `#/operator`, `#/contacts`, `#/settings`, etc. |
| A specific conversation  | `#chat=telegram:123`                           |
| A specific Operator card | `#/operator?chat=telegram%3A123`               |
| Provider setup           | `#conn-telegram`                               |
| Manual provider setup    | `#conn-telegram/manual`                        |

Existing conversation/provider links remain supported. An explicit URL takes precedence over the last remembered section. Within a tab, session storage remembers the last section and its detail; opening the bare app address resumes that place. Browser history and the current URL remain functional when session storage is unavailable. URL updates preserve the hosted base path and query parameters.

Selecting a different menu section creates one history entry. Selecting the current item again does not create another entry. Chat selection and Operator **Next** enter browser history; automatic selection/counter correction replaces the current Operator entry. An Operator card is restored only if it still qualifies under the current unread and type settings. Initial directory loading does not clear the saved card prematurely. Merely reloading or traversing history does not acknowledge unread messages.

Provider mode changes replace the current provider entry, so Back leaves the provider instead of cycling between setup tabs. The provider's in-app Back button consumes its parent list entry when available; for a direct link, it replaces the detail with the list. Cross-component navigation, contact actions, notification clicks, bot invite links and tutorial CTAs use the same section routing. In-page anchors such as the skip link do not switch sections.

History entries retain the section's window scroll. Restoration waits for asynchronously loaded content to be tall enough, and user input cancels a pending restoration. Existing chat reading-position, folder, column-width and draft behavior continues within each conversation surface.

Regression coverage: `app-navigation.test.js`, `e2e-navigation-browser.mjs` and `e2e-operator-browser.mjs`. Browser checks cover all menu sections, direct links, provider modes, Back/Forward, reloads without a Chat flash, Operator card restoration without read acknowledgements, scroll restoration and compact navigation in Chromium and WebKit.

A chat deep link opens the conversation pane directly on phones as well as desktops. Operator's postponed card order is retained per tab; selecting Next never acknowledges the chat. See [UI states and queue behavior](UI-STATES.md).
