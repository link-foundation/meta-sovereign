# Unbiased VK message identities

Published head `07d3159e` fails both hosted JavaScript CodeQL gates for
`js/biased-cryptographic-random` at `vk-cancelled-planner.js:106`.
The preserved Checks job log has the finding at lines 10001–10003; the
security workflow repeats it at lines 13005–13007. The 300-file diff warning
is unrelated to this concrete finding.

The planner reduced a uniform unsigned 32-bit draw modulo 2,147,483,646.
That does not evenly divide the source domain and also excludes the largest
valid positive signed identity. A shared generator masks the independent sign
bit and rejects zero, preserving a uniform distribution over 1–2,147,483,647.
Eight zero-only draws fail explicitly rather than looping indefinitely.
The reviewed identity remains persisted and reused for its one native action.

`ci-vk-message-random-before.py` restores the actual published planner for a
finite regression: an all-one draw produces 4, instead of 2,147,483,647.
The corrected planner and deterministic zero, sign-bit and upper-bound cases
pass. No live provider action is performed. Hosted CodeQL clearance and all
other pending issue criteria remain required before acceptance.
