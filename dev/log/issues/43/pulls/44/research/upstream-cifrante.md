Deno 2.9.8 on Windows x64 terminates with **3221225477 / 0xC0000005** (access violation) while constructing teleproto's `IGE` wrapper with cifrante 0.6.0. The portable backend passes the identical offline encryption/decryption test. There is no JavaScript exception to catch.

Observed on GitHub `windows-2025`, Node 22.23.4 driving Deno 2.9.8; exact teleproto 1.232.0 / cifrante 0.6.0. Full reproduction and raw output: https://github.com/link-foundation/meta-sovereign/actions/runs/40709046923/job/122890030487 . Native probe prints `before construction` then exits with 0xC0000005; portable probe prints backend `wasm` and passes all three fresh test workers. This report isolates the native boundary; it does not establish whether ownership is in cifrante's addon, the published Windows binary, or Deno's Node-API implementation.

Minimal reproduction (PowerShell, isolated directory, no Telegram account or network connection during the test):

```powershell
npm init -y
npm install --ignore-scripts teleproto@1.232.0 cifrante@0.6.0
@'
import { createRequire } from "node:module";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
Deno.test("offline AES-IGE", () => {
  const { IGE } = createRequire(import.meta.url)("teleproto/crypto/IGE.js");
  console.log("before construction");
  const cipher = new IGE(Buffer.alloc(32, 1), Buffer.alloc(32, 2));
  try {
    console.log("backend", IGE.backend());
    const input = Buffer.alloc(144, 3);
    assert.deepEqual(cipher.decryptIge(cipher.encryptIge(input)), input);
  } finally { cipher.dispose(); }
});
'@ | Set-Content probe.test.js
Remove-Item Env:CIFRANTE_NATIVE -ErrorAction SilentlyContinue
deno test --no-config --no-check --allow-all --v8-flags=--max-old-space-size=384 probe.test.js
$LASTEXITCODE
$env:CIFRANTE_NATIVE = '0'
deno test --no-config --no-check --allow-all --v8-flags=--max-old-space-size=384 probe.test.js
$LASTEXITCODE
```

Expected: both executions complete the round trip. Actual: native execution exits 3221225477 before logging the backend; `CIFRANTE_NATIVE=0` returns 0 with backend `wasm`. Our reusable bounded harness uses 144 bytes, at most three workers, a 384 MiB heap and a 30-second child deadline: https://github.com/link-foundation/meta-sovereign/blob/issue-43-1924384484c0/experiments/issue43-cifrante.mjs (`--raw-native` explicitly reproduces the original failure).

Workaround: set `CIFRANTE_NATIVE=0` **before the first cifrante operation** on Windows Deno, including in the actual application entry path. Keep crypto comparisons enabled. Our Linux Node/Deno probes and Node/Bun CI do not show this crash; no claim of broad Deno/Bun support is intended.

Possible code fixes: add a Windows-Deno compatibility check before `nativeAddon()`/`module.supported()` and choose the existing WASM path, then add a Windows Deno child-process test so a native crash is preserved as an exit code. Separately debug the native load / CPU probe / `aes_ige_create` boundary under Deno and Node with symbols to determine the underlying invalid access. A JS `try/catch` around loading cannot recover from the access violation. We can remove our narrow application workaround once an upstream version passes the same test.
