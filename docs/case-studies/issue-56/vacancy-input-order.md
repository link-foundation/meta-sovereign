# Vacancy input ordering: negative investigation

A finite owned WebKit probe tested whether entering the exclusion text and
query in the same native event turn could lose the exclusion before discovery.
It uses the existing synthetic vacancy fixture, starts neither a provider nor
the user's server, and closes its page, browser and private fixture afterward.

```sh
node experiments/issue-56/vacancy-input-order.mjs
```

The observed values remain `Python` and `final paragraph`. The first card stays
`needs-description`; the second is `responded`. This probe does not reproduce
an input-ordering race. It therefore supplies no evidence to change production
input handling or the hosted discovery assertions. The original hosted failure
still requires its actual failing trace and current-head verification.

This is a retained negative result, not a root-cause finding or acceptance of
HH02/HH03/HH05. Every unfinished criterion remains active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/vacancy-input-order.tar.gz),
[hash manifest](data/vacancy-input-order.tar.sha256.json).
