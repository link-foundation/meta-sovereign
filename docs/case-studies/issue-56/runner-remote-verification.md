# Remote execution acceptance audit

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The pinned desktop requirements, Execution Modes 1–8 at
`8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1`, require Dockerless local execution,
SSH with Screen or Docker isolation, start-command wrappers, Screen defaults,
positively observed mutual exclusion and no automatic start.

The existing hosted proof exercises real SSH/Docker and local Screen. The same
finite application lifecycle now also runs with remote Screen, through the same
production profile, transport, controller, launch and private health inspection.
Both variants require stopped initial observations without launch, idempotent
Start, ready application health, two explicit remote starts, both switching
directions, retained private data and stopped/removed fixture resources.
Docker additionally requires owned exited-container cleanup and refusal to
start, stop or inspect a same-named foreign container.

The loopback daemon sets a separate private `SCREENDIR` in remote sessions using
OpenSSH's documented [SetEnv](https://man.openbsd.org/sshd_config#SetEnv).
This represents the distinct socket namespaces of two hosts while retaining
real SSH authentication, strict known-host validation and the actual Screen
binary. Both use existing isolated private stores, never a user's application.
The remote Screen target selects the exact supported CI Node executable.

Scoped syntax, lint, formatting and ShellCheck cover the changed fixture. No
daemon or platform/runtime matrix runs locally. The mandatory hosted job retains
its existing deadline. The repaired `9c42ac80` [Docker proof](https://github.com/link-foundation/meta-sovereign/actions/runs/44247173642/job/134609494750)
passes with actual SSH, application health, both switches, one owned-container
restart, retained data, foreign refusal and closed application resources. Its
complete job log and artifact are preserved. The expanded two-backend proof is pending;
VD02 stays unchecked and all 32 unfinished requirements remain active.
