"""Retain exact-parent metadata loss and bounded native/MCP verification."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = '42431722feb68ee47ea7ccc70db066070cfacd9d'
sources = [
    'js/src/assignments/vacancy-reader.js',
    'js/tests/e2e-vacancies-browser.mjs',
    'js/tests/helpers/e2e-vacancy-metadata.mjs',
    'docs/case-studies/issue-56/vacancy-metadata.md',
    'docs/case-studies/issue-56/vacancy-metadata-plan.md',
    'experiments/issue-56/collect-vacancy-metadata.py',
    *[str(path.relative_to(root)) for path in
      (root / 'experiments/issue-56').glob('vacancy-metadata*.mjs')],
]
logs = ['before.log', 'after.log', 'node.log', 'lint.log', 'format-check.log',
        'secrets.log', 'diff.log', 'mcp-result.json', 'mcp-server.log',
        'mcp-console.log', 'mcp-close.json']
logs = [f'ci-logs/vacancy-metadata-{name}' for name in logs]
before = (root / logs[0]).read_text()
assert 'modern gross salary retained' in before and 'actual: false' in before
assert json.loads((root / logs[1]).read_text()) == {
    'variants': 4, 'opens': 5, 'cacheRetained': True,
    'providerClicks': 0, 'pageErrors': 0, 'liveProvider': False,
}
assert 'tests 13' in (root / logs[2]).read_text()
for name in [logs[3], logs[5], logs[6]]:
    assert not (root / name).read_text().strip(), name
assert 'All matched files use Prettier code style!' in (root / logs[4]).read_text()
assert json.loads((root / logs[8]).read_text().splitlines()[-1]) == {
    'opens': 2, 'closed': True, 'providerClicks': 0, 'pageErrors': [],
    'liveProvider': False, 'resourcesClosed': True,
}
mcp = json.loads((root / logs[7]).read_text())['content'][0]['text']
mcp_result = json.loads(mcp.split('### Result\n')[1].split('\n###')[0])
assert mcp_result == {
    'modernMetadata': True, 'cacheRecovered': True, 'widths': [1180, 390],
    'pageErrors': [], 'liveProvider': False,
}
screenshots = [str(path.relative_to(root)) for path in
               (root / 'docs/screenshots/issue-56-vacancy-metadata').rglob('*.png')]
reference = ['ci-logs/vacancy-insights-reference.mjs',
             'ci-logs/vacancy-expansion-reference.mjs']
entries = {name: (root / name).read_bytes()
           for name in [*sources, *logs, *screenshots, *reference]}
entries['before/js/src/assignments/vacancy-reader.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/src/assignments/vacancy-reader.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'liveProvider': False, 'acceptedInventoryRows': [],
    'reference': 'konard/hh-job-application-automation@fa0991b8c2d0896fb3b4be6c69947f0590094b15',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-metadata.tar.gz', entries)
