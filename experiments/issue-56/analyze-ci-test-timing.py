"""Summarize completed test durations and wall-clock gaps from saved CI logs."""
from datetime import datetime
from pathlib import Path
import re
import sys

for name in sys.argv[1:]:
    lines = Path(name).read_text(encoding="utf-8-sig").splitlines()
    records = []
    completed = []
    for line in lines:
        text = re.sub(r"\x1b\[[0-9;]*m", "", line)
        stamp = re.search(r"(\d{4}-\d{2}-\d{2}T[\d:.]+Z)", text)
        if not stamp:
            continue
        at = datetime.fromisoformat(stamp[1].replace("Z", "+00:00"))
        text = text[stamp.end():].strip()
        records.append((at, text))
        duration = re.search(r"\(([\d.]+)ms\)$", text)
        if duration:
            completed.append((float(duration[1]), at, text))
    print(f"{name}: {len(completed)} completed assertions")
    if completed:
        print("Assertion interval:", completed[0][1], completed[-1][1])
    for duration, at, text in sorted(completed, reverse=True)[:12]:
        print(f"Slow {duration:.1f} ms {at.isoformat()} {text}")
    gaps = [(float((b[0] - a[0]).total_seconds()), a, b) for a, b in zip(records, records[1:])]
    for seconds, before, after in sorted(gaps, reverse=True)[:10]:
        print(f"Gap {seconds:.1f}s after {before[0].isoformat()} {before[1][:150]} -> {after[1][:150]}")
