# Saved unread CLI model intent

The unread CLI loaded `modelDraft: true` from a configuration file or saved
automation but created its model owner only when `--model-draft` appeared on
the command line. With no injected runner, those saved settings could not
prepare the requested draft. The command now owns the lazy model service for
unread review regardless of where the setting originated. Drafting still
requires answer mode and model opt-in; inspection and explicit opt-out make
zero model calls. An injected runner retains its existing ownership.

Reproduce with `python -B experiments/issue-56/unread-cli-model-before.py`.
The two saved-intent cases fail against exact parent `8250c313`; the script
restores the current sources in `finally`. Five focused regressions pass under
each of Node, Bun and Deno. They verify saved automation, configuration files,
explicit opt-out, inspection, injected ownership, lifecycle draining and zero
chat sends. The existing CLI/text/binary-Lino model-intent test also passes.
The model runner is synthetic; these checks do not launch a configured model
or contact a live provider.

Sources, parent failures and passing logs are retained in the
[evidence archive](data/unread-cli-model.tar.gz) with its
[hash manifest](data/unread-cli-model.tar.sha256.json).
Exact-head hosted verification and all 60 unchecked inventory rows remain
required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
