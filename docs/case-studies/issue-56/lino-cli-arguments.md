# Shared CLI argument parsing

The shared CLI imported a handwritten stand-in despite already depending on
`lino-arguments@0.4.1`. It also treated the end-of-options marker as an empty
flag: `--store=fixture -- --confirm --store=other` activated confirmation and
changed the chosen store instead of retaining two positional values. The
finite regression fails three of four cases against `c4b904c3`'s parser.

All CLI consumers now use the installed package's exported `yargs` parser.
The adapter retains existing kebab-case keys, explicit string values including
`false`, empty values and leading-zero numbers, true bare flags, duplicate
last-value precedence, literal dotted keys and single-dash words. Commands
continue to own their domain validation. The parser handles `--` normally.
Reserved parser/prototype keys refuse before dispatch with a generic message;
library diagnostics cannot echo a supplied credential. Argument arrays remain
unmodified and one invocation cannot register flags for the next.

The comparison experiment also shows why using default yargs settings would
change existing CLI behavior: numeric coercion, boolean negation, short options
and duplicate arrays need explicit compatibility settings. A raw reserved-name
input can enter yargs' inherited-property validation; the adapter refuses such
keys before entering that path. No provider, store or external service is used
by these four regressions.

Validation uses four new parser regressions plus the existing CLI archive
round trip, help/version import boundaries, viewed-vacancy configuration and
VK token API/CLI cases, with one test file at a time. The existing hosted
Node/Bun/Deno matrix owns cross-runtime acceptance. The retained parent failure
and current result distinguish the semantic correction from dependency wiring.

This step addresses the real CLI dependency requirement of VD07. Its layered
global/local desktop settings and protected-secret requirements, local/SSH
execution and the other inventory rows remain unfinished; PR57 stays draft.

Evidence: [archive](data/lino-cli-arguments.tar.gz),
[hash manifest](data/lino-cli-arguments.tar.sha256.json).
