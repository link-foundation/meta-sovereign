"""Apply the shared-entry writer correction to fourteen existing collectors."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
for name in ['forms-reader', 'forms-journal', 'forms-sessions', 'links-concurrency',
             'forms-monitor', 'browser-apt', 'forms-prefill', 'forms-radio',
             'forms-upload', 'forms-learning', 'forms-choices', 'forms-custom',
             'forms-watchers', 'forms-configured-resume']:
    path = root / f'experiments/issue-56/collect-{name}.py'
    source = path.read_text()
    if 'write_entries_archive(archive, entries' in source:
        continue
    before, tail = source.split("with archive.open('wb') as ", 1)
    if name == 'browser-apt':
        before += ("entries = {name: (root / name).read_bytes() for name in sorted(set(names))}\n"
                   "entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\\n').encode()\n")
    source_count = ', len(sources)' if 'source hashes' in tail else ''
    for module in ['gzip', 'io', 'tarfile']:
        before = before.replace(f'import {module}\n', '')
    before = before.replace('from pathlib import Path\n',
                            'from pathlib import Path\nfrom evidence_bundle import write_entries_archive\n')
    path.write_text(before + f'write_entries_archive(archive, entries{source_count})\n')
