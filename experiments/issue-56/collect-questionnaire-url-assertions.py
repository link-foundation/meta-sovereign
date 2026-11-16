"""Retain exact CodeQL findings and the strengthened questionnaire assertions."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
parent = subprocess.check_output(['git', 'rev-parse', '3fee602d'], cwd=root).decode().strip()
findings = json.loads((logs / 'hosted-3fee-codeql-alerts.json').read_text())
assert len(findings) == 3 and all(a['rule']['id'] ==
    'js/incomplete-url-substring-sanitization' for a in findings)
failure = (logs / 'hosted-3fee-codeql-js.log').read_text()
assert 'CodeQL reported 3 unresolved findings:' in failure
assert 'pass 4' in (logs / 'questionnaire-url-assertion-node.log').read_text()
assert 'fail 0' in (logs / 'questionnaire-url-assertion-node.log').read_text()
assert not (logs / 'questionnaire-url-assertion-lint.log').read_text().strip()
assert '[forms-questionnaire]' in (logs / 'questionnaire-url-assertion-browser.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (
    logs / 'questionnaire-url-assertion-browser.log').read_text()
sources = [
    'js/tests/question-assembly-context.test.js',
    'js/tests/helpers/e2e-form-questionnaire.mjs',
    'experiments/issue-56/form-questionnaire-mcp.mjs',
]
entries = {}
for name in sources:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
for name in [
    *sources, 'experiments/issue-56/collect-questionnaire-url-assertions.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/questionnaire-url-assertions.md',
    'ci-logs/hosted-3fee-security.json', 'ci-logs/hosted-3fee-codeql-alerts.json',
    'ci-logs/hosted-3fee-codeql-js.log',
    *[str(p.relative_to(root)) for p in logs.glob('questionnaire-url-assertion-*.log')
      if not p.name.endswith(('-archive.log', '-push.log', '-commit.log'))],
]:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'workflow': 43909148185, 'job': 133445977958,
    'failureLines': [11205, 11209], 'findings': [a['number'] for a in findings],
    'focusedTests': 4, 'browser': 'focused Chromium only', 'liveProvider': False,
    'hostedCodeQL': 'required on the published correction',
    'originalIssueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/questionnaire-url-assertions.tar.gz', entries)
