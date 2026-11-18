# Defer unused provider route graphs until their first request

The Windows Deno startup refusal is preserved in [the worker loading
investigation](ci-worker-loading.md). Its original trace stops at process spawn;
it does not establish a cause. Separately, the worker's static local JavaScript
graph includes CV preparation, vacancy/application and Telegram route code before
any corresponding HTTP request arrives. That makes every idle server load code
for these optional surfaces.

The server now imports three small path guards. Each guard loads the existing
route module only when its exact namespace matches. The module system retains
concurrent import ownership and caching. Existing handlers, exports, argument
order, account scope, method checks, mutation admission, service creation and
shutdown remain in their original modules. Shared host/origin, wire, passcode
and account guards still run before dispatch. Import failures propagate through
the existing HTTP failure path instead of announcing successful operations.

The bounded static graph reader does not execute application/provider code. It
counts relative `.js` static imports and re-exports only; dynamic and external
imports are explicitly excluded. Replaying exact published implementation parent
`f09c8d2b0199e6693a9bfe22471e9b3ad81c5009` gives 1,159 modules and 5,768,578 source
bytes. The changed graph has 929 modules and 4,827,584 bytes: 230 local modules
and 940,994 source bytes are deferred. All deferred routes remain available.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/route-loading-before.py
node --max-old-space-size=192 experiments/issue-56/worker-import-graph.mjs
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/route-loading.test.js js/tests/server-resource-release.test.js
node --max-old-space-size=384 --test --test-concurrency=1 --test-name-pattern='cv api catalogue' js/tests/cv-server.test.js
node --max-old-space-size=384 experiments/issue-56/rolling-startup-profile.mjs
```

The fresh-process regression fails against that parent because all three route
modules load during idle startup. Afterward it verifies no such module is loaded
by startup, unrelated/lookalike paths, denied origins or unsupported request
encoding. First matching requests load only their corresponding module, and
overlapping first requests return the original CV catalogue. Both Lino encodings
retain vacancy capabilities with `apply: false`, unavailable Telegram state,
unknown-operation 404 and method refusal. The HTTP fixture runs on every runtime;
only the module-load observer uses Node's loader hooks. Other runtimes retain
the portable check rather than emulating an unsupported hook.

Five focused checks pass, including three existing shutdown/store ownership
checks; three existing CV catalogue checks also pass. One isolated production
CLI start/reuse/upgrade scenario passes with initial readiness at 3,358 ms and
worker import checkpoints at 105 and 1,396 ms. This is one Linux observation,
not a cross-machine benchmark or evidence of the Windows cause. Lint, format,
diff checks and the unchanged duplication gate pass (6.49%). No local full suite,
build, browser matrix, provider request or owner application server is used.

The fixed readiness budget, full release staging/verification and runtime matrix
remain unchanged. Hosted checks must run on the resulting commit. This work
accepts no inventory criterion: all 60 unchecked criteria remain required and
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.

[Preserved sources and results](data/deferred-provider-routes.tar.gz) and
[hash manifest](data/deferred-provider-routes.tar.sha256.json).
