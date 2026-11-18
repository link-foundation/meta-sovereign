"""Preserve the exact hosted failures and finite actual-caller reproduction."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = '997b0dd2e1c7297a6ab4db17e7a4421aa1e38094'
paths = ['js/tests/e2e-follow-links-browser.mjs',
    'js/tests/helpers/follow-disclosure.mjs',
    'js/tests/helpers/e2e-follow-disclosure-trace.mjs',
    'js/tests/helpers/e2e-chat.mjs', 'js/tests/helpers/e2e-page-errors.mjs',
    'js/tests/e2e-chat-loading-browser.mjs', 'js/tests/e2e-page-errors.test.js',
    'js/tests/helpers/follow-links.mjs', '.github/workflows/release.yml',
    'experiments/issue-56/follow-links-opening.mjs',
    'experiments/issue-56/collect-ci-follow-links.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-follow-links-opening.md',
    *[f'docs/screenshots/issue-56-ci-follow-links/{name}.png' for name in ['before', 'after']],
]
logs = [f'ci-logs/ci-follow-links-{name}.log' for name in [
    'before', 'after', 'native', 'reload', 'diagnostics', 'lint',
    'syntax', 'format-check', 'secrets', 'diff']]
read = lambda name: (root / f'ci-logs/ci-follow-links-{name}.log').read_text()
before = json.loads(read('before').splitlines()[0])
after = json.loads(read('after').splitlines()[0])
assert before['parentFailureReproduced'] and before['coordinateShiftPx'] == 24
assert after['preservedOwnerDraft'] and after['actualCallerOpenings'] == 2
assert not after['originalHostedTimingReproduced'] and not after['liveProvider']
assert '[e2e-follow-links] OK (webkit)' in read('native')
for phase in ['initial-after-opening', 'reload-after-opening']:
    lines = [line for line in read('native').splitlines() if f'"phase":"{phase}"' in line]
    assert len(lines) == 1 and json.loads(lines[0].split('[follow-disclosure] ', 1)[1])['open']
assert '[e2e-chat-loading] OK (webkit)' in read('reload')
assert 'request failed' in read('reload')
assert 'pass 12' in read('diagnostics') and 'fail 0' in read('diagnostics')
for name in ['lint', 'syntax', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')
entries = {name: (root / name).read_bytes() for name in [*paths, *logs]}
for name in ['js/tests/e2e-follow-links-browser.mjs', 'js/tests/helpers/e2e-chat.mjs',
             'js/tests/e2e-chat-loading-browser.mjs', '.github/workflows/release.yml']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
name = 'js/tests/e2e-follow-links-browser.mjs'
assert entries[f'before/{name}'] == subprocess.check_output(['git', 'show', f'b6e7d9e1:{name}'], cwd=root)
for name in ['ci-logs/hosted-997b0dd2-webkit-2-attempt1.log', 'ci-logs/hosted-997b0dd2-artifacts.json',
             'ci-logs/hosted-997b0dd2-chat-loading-probe.log',
             *[f'ci-logs/hosted-997b0dd2-webkit-2-artifacts/ms-e2e-{kind}-webkit.png'
               for kind in ['follow-links', 'chat-loading']]]:
    entries[name] = (root / name).read_bytes()
entries['metadata.json'] = (json.dumps(dict(parent=parent, run=44220122766, job=134521683307,
    before=before, after=after, diagnosticChecks=12, networkLossCauseConfirmed=False,
    originalHostedTimingReproduced=False, liveProvider=False, localFullSuite=False,
    issueComplete=False, exactSourceHostedVerificationRequired=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-follow-links-opening.tar.gz', entries)
