# VK user token

In **Connections → VK**, validate an existing user token or paste the exact
standalone `https://oauth.vk.com/blank.html#…` redirect. The desktop app also
offers **Authorize with Kate Mobile** in an isolated VK window. VK may refuse
this historical client or message access; displaying a login page does not
prove that authorization or messaging works.

Start the JS server or desktop app with `MS_SECRET_PASSPHRASE` set, following
[Protecting stored secrets](USER-GUIDE.md#protecting-stored-secrets). Use the same
passphrase at every start. Acquisition refuses to save without protected
storage. Other store contents are not encrypted by this setting.

Check **Validate and replace…** for each attempt. Validation reads the user,
permissions and one conversation count; it sends no messages. A valid user
token is saved as the protected `secret:vk:user-token` credential shared by
live readers and publication. Legacy credentials remain as fallbacks. A valid
user without message access is saved with that limitation shown. Invalid,
community and mismatched-account tokens are refused. A storage failure must be
reviewed before retrying; the screen does not claim that a rejected write
completed.

The password field clears when import starts. Receipts contain an operation
ID and validated identity/capabilities, without the token or pasted URL. Cancel
waits for owned work to drain. If saving was already acknowledged, the receipt
truthfully reports saved. Reloading reads status; it never starts authorization,
repeats an import or restores consent. Restarting the server clears the
transient operation status while retaining the protected credential.

```sh
node js/bin/meta-sovereign.js vk-token status
node js/bin/meta-sovereign.js vk-token start --confirm
node js/bin/meta-sovereign.js vk-token import --confirm
# Import asks privately in the terminal; never put a token in arguments.
node js/bin/meta-sovereign.js vk-token cancel --id=<operation-id>
```

Start/import returns a waiting receipt; read status until saved, failed or
cancelled. Desktop authorization is unavailable on a headless server; import
remains available. `--url` accepts an HTTPS or loopback HTTP origin. Shared
`GET /api/vk/token` and `POST /api/vk/token/{start,import,cancel}` use either
default text or binary Links Notation. Start/import requires `confirm: true`,
import adds `value`, and cancel requires the current `id`. Failed or uncertain
requests are not automatically repeated. See the [finite evidence](case-studies/issue-56/vk-token.md).
