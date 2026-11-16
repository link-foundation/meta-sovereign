"""Preserve the exact CI failure without weakening duplication or browser checks."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = subprocess.check_output(['git', 'rev-parse', '3fee602d'], cwd=root).decode().strip()
failure = (logs / 'hosted-3fee-lint.log').read_text()
assert 'jscpd found too many duplicates' in failure and '6.52%' in failure
assert not (logs / 'ci-duplication-fixtures-lint.log').read_text().strip()
assert '[e2e-sticker-search] OK (chromium)' in (
    logs / 'ci-duplication-fixtures-browser.log').read_text()
summary = json.loads((logs / 'ci-duplication-fixtures-stats.json').read_text())
assert summary['percentage'] <= 6.5 and summary['duplicatedLines'] < 51776
assert (root / '.jscpd.json').read_bytes() == subprocess.check_output(
    ['git', 'show', f'{parent}:.jscpd.json'], cwd=root)
scenarios = [f'js/tests/e2e-{name}-browser.mjs' for name in [
    'stickers', 'sticker-menu', 'sticker-search']]
entries = {}
for name in scenarios:
    before = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
    current = (root / name).read_bytes()
    # From the first scenario-specific route onward all checks and cleanup survive.
    anchor = b'const sends = [];' if 'search' not in name else b'const searched = '
    assert before[before.index(anchor):] == current[current.index(anchor):], name
    entries[f'before/{name}'] = before
for name in [
    *scenarios, 'js/tests/helpers/e2e-sticker-fixture.mjs', '.jscpd.json',
    'experiments/issue-56/collect-ci-duplication-fixtures.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-duplication-fixtures.md',
    'ci-logs/hosted-3fee-lint.log',
    *[str(p.relative_to(root)) for p in logs.glob('ci-duplication-fixtures-*')
      if p.is_file() and p.suffix in ['.log', '.json'] and not p.name.endswith(
          ('-archive.log', '-commit.log', '-push.log'))],
]:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'failedRun': 43909148654, 'failedJob': 133446896597,
    'failureLines': [18321, 18327], 'unchangedThreshold': 6.5,
    'currentDuplication': summary, 'scenarioAssertionsAndCleanupUnchanged': True,
    'localBrowser': 'focused sticker-search Chromium only',
    'fullMatrix': 'required in CI on the published correction',
    'originalIssueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-duplication-fixtures.tar.gz', entries)
