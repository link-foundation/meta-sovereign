# Watched reply dispatch ownership

The shared dispatcher verifies current ownership before arming and again before
clicking. The watched strict-choice and foreground text methods check only before
calling that dispatcher and omit its verifier. Stop, navigation or a changed
answer policy during arming can therefore still issue a native reply.

1. Reproduce cancellation during arming through the actual watched adapter for
   strict choices and explicitly authorized text replies. Keep the synthetic
   document and finite synchronization fixture in `experiments/issue-56`.
2. Forward the existing verifier to the common dispatcher. Preserve frozen-turn
   checks, hook release, definite refusal and positive-receipt draining after an
   already issued click. Do not introduce another sender or broaden authority.
3. Run focused adapter and watch lifecycle tests in Node and Deno. Preserve the
   actual parent failures, static checks and evidence archive. Let hosted CI run
   the full matrix; update the existing release note and PR 57.

This is a prerequisite for QA14/QA20/HH11 orchestration. General unread question
processing, the first-unresolved-chat hold, application-child integration and
every other unchecked issue requirement remain unfinished.
