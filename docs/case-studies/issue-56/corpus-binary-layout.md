# Complete-corpus binary encoding cost

At `5f63c49f74d38e2d9885314c734a764e9dc2f656`, macOS Node shard 2/8 failed its complete 101-description binary API regression. Preserved job `134788617058` records the ten-second deadline and 12,799 ms cancellation at log lines 5615–5619; the adjacent text variant passed in 1,038 ms. The following published parent `431935dc5e53a7e38d90944e2a538703cb108a0c` retains the same transport source.

The binary adapter used the published codec's default pure-doublet, internal-reference layout. This builds unary scalar graphs and linked character lists for ordinary object payloads. A finite comparison of all four external-reference/arity combinations preserves the typed object document exactly. For the existing 101-description corpus, defaults produce **34,544 links / 138,180 bytes**, versus **2,204 links / 81,311 bytes** with published external references and variable arity. External references alone increase packet size; selecting both features avoids that tradeoff.

The shared binary writer now selects `BinaryLinoOptions(true, new ArityRange(2, null))`. It still uses the published binary codec, the same typed object AST and every existing finite decoder limit. The packet declares its own layout. Readers retain all four published layouts, including older pure-doublet packets; a default independently configured upstream decoder reads new output. Text transport and opt-in JSON policy retain their behavior. Streamed binary recovery dumps and synchronization use the same shared implementation.

Reproduce with bounded inputs and one test process:

```sh
node --max-old-space-size=384 --stack-size=1024 experiments/issue-56/corpus-binary-modes.mjs
node --test --test-concurrency=1 experiments/issue-56/corpus-binary-parent.mjs
node --test --test-concurrency=1 js/tests/lino-binary-layout.test.js js/tests/lino-transport.test.js js/tests/vacancy-corpus.test.js
node --test --test-concurrency=1 js/tests/backup-recovery.test.js js/tests/sync-wire.test.js
```

The exact parent fails the graph-size regression; two independent interoperability controls pass. Current code passes all three layout checks, 21 combined transport/corpus checks and 11 recovery/sync checks. The original complete-corpus test, its 101 records and ten-second deadline remain intact. It passes locally in 3,875 ms after the change. A separate fixed-phase probe records five binary encodes totaling 4,933 ms before and 924 ms after; total test time falls from 8,174 to 4,100 ms in those observations. A separate uninstrumented parent pass took 9,798 ms. These measurements establish substantial codec overhead and a local improvement, not every cause of hosted scheduler latency or a timing guarantee on every machine.

The finite reproduction also runs against published `links-notation@0.31.6`: 101 synthetic documents round-trip, encoding falls from 299 to 37 ms and packet size from 33,699 to 17,775 bytes. Its relevant source blob matches the installed 0.31.3 implementation. The full GitHub version comparison is truncated at 300 files; the comparison alone cannot prove source equality. The separately checked `Binary.js` blob establishes only that file's identity. [Upstream issue 420](https://github.com/link-foundation/links-notation/issues/420) includes a self-contained example, the supported workaround and suggested documentation/small-scalar optimization. It does not request weakening limits or replacing the associative default.

The [evidence archive](data/corpus-binary.tar.gz) and [manifest](data/corpus-binary.tar.sha256.json) preserve failed hosted logs, finite probes, exact-parent source, current source and focused results. The web bundle is rebuilt because portable clients share the encoder. No UI appearance changes or authenticated provider operation is claimed. Exact-source hosted validation remains required; all **30 unfinished criteria** stay required in PR57, which remains draft and unmerged.
