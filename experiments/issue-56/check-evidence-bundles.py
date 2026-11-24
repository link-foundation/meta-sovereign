"""Exercise existing collectors into temporary archives without replacing history."""
import json
from pathlib import Path
import runpy
import tarfile
import tempfile
import evidence_bundle

original = evidence_bundle.bundle
root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='issue-56-collector-check-') as directory:
    completed = []
    def temporary_bundle(root, sources, destination, metadata, pattern, before=None):
        target = Path(directory) / Path(destination).name
        original(root, sources, target, metadata, pattern, before)
        with tarfile.open(target) as saved:
            actual = json.load(saved.extractfile('metadata.json'))
            assert actual['screenshots'], 'Screenshot evidence stays in the metadata'
            for name in (before or {}):
                assert saved.getmember(f'before/{name}').size > 0
        completed.append(target.name)
    evidence_bundle.bundle = temporary_bundle
    for collector in ['collect-forms-subjects.py', 'collect-forms-timezone.py',
                      'collect-resume-profile.py', 'collect-forms-capacity.py',
                      'collect-forms-model.py']:
        runpy.run_path(str(root / 'experiments/issue-56' / collector))
    assert len(completed) == 5
    print('Five existing collectors preserve verified archives, metadata and prior source snapshots.')
