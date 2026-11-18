"""Check a denied localStorage getter before/after, restoring the draft helper."""
from pathlib import Path
import subprocess

source = Path("js/src/web/publication-state.js")
saved = source.read_text()
try:
    for label, content in [
        ("before", saved.replace("readPublicationDraft = (storage)",
                                 "readPublicationDraft = (storage = globalThis.localStorage)")),
        ("after", saved),
    ]:
        source.write_text(content)
        with open(f"ci-logs/publication-storage-{label}.log", "wb") as log:
            result = subprocess.run(
                ["node", "--test", "--test-name-pattern=denied localStorage",
                 "js/tests/publication-web.test.js"],
                stdout=log, stderr=subprocess.STDOUT)
        print(f"{label}: exit {result.returncode}", flush=True)
        assert result.returncode == (1 if label == "before" else 0)
finally:
    source.write_text(saved)
