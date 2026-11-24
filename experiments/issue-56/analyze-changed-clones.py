"""List only duplicate fragments that involve the current changed source files."""
import json
import subprocess
from pathlib import Path

changed = set(subprocess.check_output([
    'git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'
]).decode().split('\0'))
report = json.loads(Path('reports/jscpd/jscpd-report.json').read_text())
rows = [row for row in report['duplicates'] if any(
    row[key]['name'] in changed for key in ['firstFile', 'secondFile'])]
for row in sorted(rows, key=lambda item: item['lines'], reverse=True)[:35]:
    print(row['lines'], [(row[key]['name'], row[key]['start'], row[key]['end'])
                         for key in ['firstFile', 'secondFile']])
