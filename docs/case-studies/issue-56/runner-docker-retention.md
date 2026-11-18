# Docker completion ownership

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The exact `13788383` [real SSH/Docker job](https://github.com/link-foundation/meta-sovereign/actions/runs/44245555121/job/134603791550)
reaches application health, stops Docker, starts local Screen and switches back
successfully. At job log lines 445–455 it fails the expected single owned-container
cleanup: the controller issued none. The pinned start-command 0.44.0 completion
watcher removes successfully exited containers under its default policy.

Docker launches now explicitly use its supported `--keep-container` policy. This
leaves cleanup to the existing next-Start path, which requires a freshly observed
exact name, ownership label and exited state, removes only that ID without force,
and rechecks absence before launch. Foreign containers remain untouched; mounted
application and private store data survive. Stop retains the writable container
layer until the next explicit Start or the owner's separate cleanup.

The daemon-free fixture now models start-command's actual default automatic
removal. Selecting the published launch reproduces one failure in the existing
stop/restart lifecycle regression. Repaired sources pass all 40 focused runner
checks with one worker. No local daemon or full runtime/browser matrix was run.

The previous backend-selection correction also passes the actual hosted Screen
switch and the workflow cache-policy job. Full real SSH/Docker completion still
requires the next exact-source hosted result. VD02 stays unchecked; the inventory
remains 86 verified / 32 unfinished, and PR57 remains draft and unmerged.
