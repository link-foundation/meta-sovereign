"""Retain finite synthetic model evidence with the shared verified archive writer."""
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import tempfile

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 71' in (logs / 'forms-model-tests.log').read_text()
assert '71 passed | 0 failed' in (logs / 'forms-model-deno.log').read_text()
assert not (logs / 'forms-model-lint.log').read_text().strip()
assert '0 !== 1' in (logs / 'forms-model-before.log').read_text()
assert 'model configuration is available' in (logs / 'forms-model-browser-before.log').read_text()
browser = (logs / 'forms-model-browser-after.log').read_text()
assert 'OK (chromium)' in browser
receipt = json.loads(next(line.split('] ', 1)[1] for line in browser.splitlines()
                          if line.startswith('[forms-model]')))
assert receipt == dict(calls=1, applied=True, clarification=True, stalePreserved=True,
                       ownerPreserved=True, closed=True, submits=0)
mcp = json.loads((logs / 'forms-model-mcp.json').read_text())
assert mcp['modelCalls'] == 1 and mcp['submissions'] == 0
assert mcp['settingsPersisted'] and not mcp['unknownSelectable'] and not mcp['phoneOverflow']
assert len(mcp['reads']) == 1 and mcp['reads'][0]['closed']
assert mcp['reads'][0]['values'] == {
    'fullName': 'Owner retains this answer',
    'background': 'I build accessible browser interfaces.', 'starting': '',
}

names = [f'ci-logs/forms-model-{suffix}' for suffix in (
    'tests.log', 'deno.log', 'lint.log', 'final-format.log', 'build.log',
    'before.log', 'browser-before.log', 'baseline.log', 'browser-after.log',
    'mcp.json', 'cli-reference.md', 'parent-runs-current.json',
    'capacity-parent-ci.json', 'tutorial-parent-ci.json')]
names += ['ci-logs/question-summary-reference-requirements.md',
          'ci-logs/tutorial-parent-42901172076.log',
          'ci-logs/tutorial-parent-webkit-130136636068.log',
          'experiments/issue-56/forms-model-baseline.py',
          'experiments/issue-56/collect-forms-model.py',
          'experiments/issue-56/archive-evidence.py',
          'docs/case-studies/issue-56/forms-model-drafts.md']
names += (logs / 'forms-model-changed-code.txt').read_text().splitlines()
destination = root / 'docs/case-studies/issue-56/data/forms-model-drafts.tar.gz'
write_archive = runpy.run_path(str(root / 'experiments/issue-56/archive-evidence.py'))['archive']
with tempfile.TemporaryDirectory(prefix='forms-model-evidence-') as temporary:
    stage = Path(temporary)
    for name in sorted(set(names)):
        copied = stage / name
        copied.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, copied)
    metadata = {
        'date': '2026-11-10', 'preceding_head': '60eb49c5b60b7626b6c1c45c949ac260774ca86a',
        'node_checks': 71, 'deno_tests': 71,
        'browser': receipt, 'mcp': mcp, 'live_provider_verified': False,
        'remaining': 'Automatic chat drafts, complete provider forms and all other unchecked issue criteria remain required',
        'screenshots': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in sorted((root / 'docs/screenshots').glob('issue-56-forms-model-*.png'))},
    }
    (stage / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
    write_archive(stage, destination)
