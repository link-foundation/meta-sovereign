# VK token browser check registration

The `c4b904c3` workflow contract failed because the new `vk-token` browser
registry entry had no corresponding npm script. The browser group invokes
checks through these scripts, so this omission would also refuse the group
before the new scenario could execute.

The exact-head job log is retained in the evidence archive. Lines 637–657
identify `ci-browser-shards.test.js:73` and the missing direct Node entry. The
existing finite registry regression reproduces the failure with
`--test-name-pattern='every registered browser check resolves'`; the complete
five-test shard contract passes after adding the direct Node command. The
matching explicit WebKit npm script follows existing feature conventions.
Neither check starts a browser or a full build locally. Both hosted browser
engines still need to accept the corrected commit.

This correction does not complete issue #56. PR57 remains draft and unmerged;
all remaining inventory requirements retain their full requested scope.

Evidence: [archive](data/vk-token-registration.tar.gz),
[hash manifest](data/vk-token-registration.tar.sha256.json).
