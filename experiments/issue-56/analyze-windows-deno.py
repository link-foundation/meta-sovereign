"""Report observed Deno module wall times without executing the full suite."""
from datetime import datetime
import json
from pathlib import Path
import re
import sys

source = Path(sys.argv[1])
records = []
modules = []
phases = []
for number, line in enumerate(source.read_text(encoding='utf-8-sig').splitlines(), 1):
    line = re.sub(r'\x1b\[[0-9;]*m', '', line)
    match = re.match(r'(\d{4}-\d{2}-\d{2}T[\d:.]+Z) (.*)', line)
    if not match:
        continue
    stamp = datetime.fromisoformat(match[1].replace('Z', '+00:00'))
    text = match[2]
    records.append((stamp, text, number))
    if '##[group]Run ' in text:
        phases.append(dict(at=stamp.isoformat(), line=number, phase=text))
    module = re.search(r'running \d+ tests? from (\./js/tests/\S+)', text)
    if module:
        modules.append(dict(at=stamp, line=number, file=module[1]))
cancel = next(row for row in records if '##[error]The operation was canceled.' in row[1])
for index, module in enumerate(modules):
    end = modules[index + 1]['at'] if index + 1 < len(modules) else cancel[0]
    module['observed_seconds'] = round((end - module['at']).total_seconds(), 3)
    module['at'] = module['at'].isoformat()
report = dict(
    source=str(source),
    phases=phases,
    runner_start=records[0][0].isoformat(),
    first_module=modules[0]['at'],
    cancel_at=cancel[0].isoformat(),
    cancel_line=cancel[2],
    observed_modules=len(modules),
    observed_module_seconds=round(sum(row['observed_seconds'] for row in modules), 3),
    slowest_modules=sorted(modules, key=lambda row: row['observed_seconds'], reverse=True)[:15],
    largest_log_gaps=[dict(seconds=round((after[0] - before[0]).total_seconds(), 3),
                           before_line=before[2], after_line=after[2],
                           before=before[1][:200], after=after[1][:200])
                      for before, after in sorted(zip(records, records[1:]),
                          key=lambda pair: pair[1][0] - pair[0][0], reverse=True)[:10]],
    caveat='Module intervals include next-module startup. This cancelled run is incomplete; no complete-suite duration is inferred.',
)
print(json.dumps(report, indent=2))
