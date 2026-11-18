"""Preserve unreachable hosted proof and the independent detached native check."""
import json
import re
import subprocess
from evidence_bundle import evidence_context, evidence_logs, verify_evidence, write_entries_archive
from hosted_evidence import read_detached_learning

root, logs, read = evidence_context(__file__, 'ci-forms-watchers')
verify_evidence(read, {
    'before': ['tests 1', 'pass 0', 'fail 1', '0 !== 1'],
    'focused': ['tests 27', 'pass 27', 'fail 0', 'cancelled 0', 'skipped 0'],
    'deno': ['27 passed', '0 failed'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within the 2500 line limit.'],
})
published = '5283e26af0135f86fc879a30be18ae418da17c4a'
parent = '75be32cc'
receipt = read_detached_learning(read('browser'))
hosted_name = 'ci-logs/hosted-5283e26a-chromium-4.log'
hosted = (root / hosted_name).read_text().splitlines()
start = next(n for n, line in enumerate(hosted) if 'Browser check: forms-reader' in line)
end = next(n for n, line in enumerate(hosted) if re.search(r'Completed forms-reader in \d+ms; exit 0', line))
assert any('[e2e-forms-reader] OK (chromium)' in line for line in hosted[start:end])
assert not any('initiatingCliExited' in line for line in hosted[start:end])
names = [*evidence_logs(root, 'ci-forms-watchers'), hosted_name,
    'js/tests/ci-browser-shards.test.js', 'js/tests/ci-contracts.test.js',
    'js/tests/e2e-forms-reader-browser.mjs', 'js/tests/e2e-forms-watcher-browser.mjs',
    'js/scripts/browser-checks.json', 'js/scripts/run-browser-checks.mjs',
    'js/scripts/browser-check-shards.mjs', 'examples/forms-detached-review.mjs',
    'experiments/issue-56/collect-ci-forms-watchers.py',
    'experiments/issue-56/collect-form-learning-hosted.py',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/hosted_evidence.py',
    'docs/case-studies/issue-56/ci-forms-watchers.md',
    'docs/case-studies/issue-56/form-learning-criteria-audit.md']
names += [f'ci-logs/ci-forms-watchers-browser/issue-56-forms-watcher-{phase}.png'
          for phase in ['before', 'after']]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/tests/helpers/e2e-chat.mjs', 'js/tests/e2e-forms-reader-browser.mjs',
             'js/scripts/browser-checks.json']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{published}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(published=published, parent=parent,
    failedRegistration=True, focusedPasses=27, denoPasses=27,
    hostedReaderLines=[start + 1, end + 1], native=receipt,
    completeMinute=True, acceptedCriteria=83, unfinishedCriteria=35,
    hostedVerificationPending=True, issueComplete=False), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-forms-watchers.tar.gz', entries)
