# Import contacts

Open the default [GitHub Pages app](https://link-foundation.github.io/meta-sovereign/) and connect it to the local **JavaScript server** or desktop app. The optional localhost UI has the same import controls. Browser-only mode and the Rust server do not provide these import APIs.

## Telegram contacts

Telegram provides the signed-in user's contact list through [`contacts.getContacts`](https://core.telegram.org/method/contacts.getContacts). Connecting a user account imports those contacts as well as chats; a bot account does not have a personal address book. This is Telegram's contact list, not unrestricted access to the phone or iCloud address book. Telegram describes the distinction between Telegram contacts and saved phone contacts in its [contacts API guide](https://core.telegram.org/api/contacts).

The **Contacts** directory updates during synchronization, after reconnecting and when the app regains focus. A five-second refresh is a fallback; **Refresh contacts** requests an immediate update without clearing the search. People with no messages still appear and count toward the total. Search matches names, IDs, email addresses, phone numbers and organisations. The directory initially shows 100 matching rows; **Show more** reveals the next 100.

## macOS Contacts and iCloud

1. Enable the desired accounts in the Mac's Contacts app. iCloud, Google and Exchange contacts must already be synced there.
2. In meta-sovereign, open **Contacts → Import contacts → macOS / iCloud Contacts**.
3. Allow Contacts access when macOS asks. The server reads the unified address book using Apple's public [Contacts framework](https://developer.apple.com/documentation/contacts/cncontactstore). Merely opening the page or checking availability does not request permission or read contacts.
4. Review the new, updated and skipped counts and a sample of up to five changed contacts. Choose **Import** to save that batch, or **Cancel** to leave the local contact directory unchanged.

The native reader needs macOS Command Line Tools (`xcode-select --install`); it compiles a bundled Swift helper once and caches it privately. macOS attributes the permission request to the process launching the helper, which can be the terminal or desktop app. If access is denied, allow it in **System Settings → Privacy & Security → Contacts**, then try again. Limited access imports only the contacts macOS makes available.

This is a manual snapshot import. Run it again to pick up changes. It does not sign into iCloud, download a remote address book directly, write back to system Contacts, delete local records missing from a later snapshot, or upload anything to Telegram or another messaging service.

## vCard exports on any platform

Export contacts as a `.vcf` file from [iCloud Contacts](https://support.apple.com/en-ca/guide/icloud/mmfba748b2/icloud), [Google Contacts](https://support.google.com/contacts/answer/7199294?co=GENIE.Platform&hl=en), or another address book. In **Contacts → Import contacts**, choose **Choose vCard file**, select the file, review the preview, then choose **Import**.

Supported formats are vCard 2.1, 3.0 and 4.0, including folded lines, quoted-printable legacy exports and UTF-16 files. The limit is 10 MiB per file and 20,000 entries per batch. Imported fields are name, nickname, organisation, job title, email addresses, phone numbers, website URLs and postal addresses. Photos, notes and birthdays are not imported.

Records keep their source UID when present. Repeating an unchanged import does not create duplicates; a changed record with the same source UID updates the existing person. Exact matches on name plus email addresses and phone numbers can merge across the system and vCard imports. Names alone do not merge distinct source identities. These imports do not automatically merge Telegram identities or create messenger chats.

The preview does not write contact records. Applying it requires a single-use token bound to that exact batch, valid for five minutes; only the three most recent previews are retained. Imported records stay in the server's local store. Files and preview data travel from the hosted app directly to your local server over the configured connection; GitHub Pages does not receive them. Origin and transport restrictions are described in [local server security](LOCAL-SERVER-SECURITY.md).

## CLI

From a source checkout:

```bash
node js/bin/meta-sovereign.js contacts-import --file=contacts.vcf --preview
node js/bin/meta-sovereign.js contacts-import --file=contacts.vcf
node js/bin/meta-sovereign.js contacts-import --system --preview
node js/bin/meta-sovereign.js contacts-import --system
```

Use `--store=<directory>` to select another store. The default is `.meta-sovereign` relative to the current directory. `--preview` prints counts without writing contacts; omitting it applies the import. `--system` is macOS only and can request OS permission even for a preview, because the source must be read to calculate changes.

The CLI opens the store directly and respects its exclusive lock. Stop a server using that store first, use a separate store, or use the app's import controls while the server runs. No command uploads contacts to an external service.

## Verification

Unit and API tests cover vCard formats, Unicode, stable identities, duplicates, previews, permission errors, origin rejection and single-use confirmations. The browser flow covers native-source fixtures, vCard upload, cancellation, repeated import, search and pagination in Chromium and WebKit. The Swift helper is compiled and its permission-status mode is checked on macOS; automated tests do not read a real personal address book. An actual import requires the person's OS permission on their Mac.
