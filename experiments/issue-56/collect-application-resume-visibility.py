"""Preserve bounded native warning regression and isolated UI evidence."""
import json
from pathlib import Path
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'e68448ac0a526e5e62e5f5d178770a166d4e752b'
sources = [
    'js/src/jobs/application-actions.js', 'js/src/jobs/application-batch.js',
    'js/src/jobs/application-context-recovery.js', 'js/src/jobs/application-drafts.js',
    'js/src/jobs/application-holds.js', 'js/src/jobs/application-limit-backups.js',
    'js/src/jobs/application-limit-challenge.js', 'js/src/jobs/application-limit-rejections.js',
    'js/src/jobs/application-limit-wait.js', 'js/src/jobs/application-options.js',
    'js/src/jobs/application-page.js', 'js/src/jobs/application-popup.js',
    'js/src/jobs/application-result.js', 'js/src/jobs/application-review.js',
    'js/src/web/app.min.js',
    *[f'js/src/web/locales/{language}-application.js' for language in ['en', 'ru', 'hi', 'zh']],
    'js/scripts/browser-checks.json', 'js/tests/ci-browser-shards.test.js', 'package.json',
    'js/tests/job-application-resume-visibility.test.js',
    'js/tests/helpers/e2e-application-resume-visibility.mjs',
    'js/tests/e2e-job-application-visibility-browser.mjs',
    'experiments/issue-56/application-resume-visibility-before.py',
    'experiments/issue-56/application-resume-visibility-dom.mjs',
    'experiments/issue-56/application-resume-visibility-native.mjs',
    'experiments/issue-56/application-resume-visibility-mcp.mjs',
    'experiments/issue-56/application-hold-mcp-control.mjs',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/collect-application-resume-visibility.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/application-resume-visibility.md',
]
prefix = 'ci-logs/application-resume-visibility-'
logs = [prefix + name for name in [
    'before.log', 'before-native.log', 'focused.log', 'native.log',
    'format-check.log', 'lint.log', 'diff.log', 'mcp.json', 'mcp-close.json',
    'mcp-server.log', 'cleanup.json',
]]
references = [f'ci-logs/hh05-reference-{name}.mjs{suffix}'
              for name in ['deferred-questions', 'resume-visibility']
              for suffix in ['', '.json']]
references += ['ci-logs/hh05-reference-words.mjs', 'ci-logs/hh05-reference-words.json']
images = [str(path.relative_to(root)) for path in sorted(
    (root / 'docs/screenshots/issue-56-application-resume-visibility').glob('*.png'))]
assert len(images) == 5
entries = {name: (root / name).read_bytes() for name in [*sources, *logs, *references, *images]}
for name in sources:
    if name.startswith('js/src/'):
        entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
assert 'fail 6' in entries[prefix + 'before.log'].decode()
assert 'rendered résumé warning must block' in entries[prefix + 'before-native.log'].decode()
assert all(value in entries[prefix + 'focused.log'].decode() for value in ['pass 24', 'fail 0'])
native = json.loads(entries[prefix + 'native.log'].decode().splitlines()[-1])
assert native['main']['hiddenVariants'] == 10 and native['main']['synchronousRefusals'] == 4
assert native['popup']['binaryLino'] is True
assert all(value['providerSubmissions'] == 0 and value['browsersClosed'] and value['errors'] == []
           for value in native.values())
mcp = json.loads(entries[prefix + 'mcp.json'])
assert mcp['renderedWarningBlocked'] and mcp['collapsedIgnored'] and mcp['phoneFits']
assert mcp['ownerValuesPreserved'] and mcp['dismissalDoesNotSend'] and mcp['reloadDidNotReplay']
assert mcp['providerSubmissions'] == 0 and mcp['browserClosed'] and mcp['errors'] == []
assert json.loads(entries[prefix + 'mcp-close.json'])['closed'] is True
assert json.loads(entries[prefix + 'cleanup.json'])['portsClosed'] is True
assert 'All matched files use Prettier code style!' in entries[prefix + 'format-check.log'].decode()
assert not entries[prefix + 'lint.log'].strip() and not entries[prefix + 'diff.log'].strip()
entries['metadata.json'] = (json.dumps(dict(parent=parent, checks=24,
    hh05Complete=False, issueComplete=False, liveProvider=False,
    exactSourceHostedVerificationRequired=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/application-resume-visibility.tar.gz', entries)
