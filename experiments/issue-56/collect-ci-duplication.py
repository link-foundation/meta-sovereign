"""Retain the hosted duplication failure and byte-preserving writer correction."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context

root, logs, read = evidence_context(__file__, 'ci-duplication')
base = '242d4ccddff0faf2ff53207e71125478b68dddf8'
totals = {}
for key, folder in [('before', 'jscpd-242d'), ('after', 'jscpd-shared-final')]:
    report = json.loads((logs / folder / 'jscpd-report.json').read_text())
    totals[key] = report['statistics']['total']
assert totals['before']['percentage'] > 6.5
assert totals['after']['percentage'] < 6.5
assert 'PASS: four bounded cases' in read('writer')
assert 'pass 20' in read('contracts')
assert 'All workflows enforce' in read('workflow')
assert not read('secrets').strip()
(logs / 'ci-duplication-totals.json').write_text(json.dumps(totals, indent=2) + '\n')
files = [str(p.relative_to(root)) for p in logs.glob('ci-duplication-*') if p.is_file()]
files += ['ci-logs/checks-43245201058.log', 'ci-logs/checks-43245201058.json', '.jscpd.json']
bundle(root, changed_sources(root, base) + files,
       'docs/case-studies/issue-56/data/ci-evidence-duplication.tar.gz',
       dict(parent=base, failed_run=43245201058, unchanged_threshold=6.5,
            byte_comparison_cases=4, workflow_contracts=20, totals=totals,
            remaining='Exact new-head CI and all unchecked issue criteria'), 'issue-56-ci-duplication/*.png')
