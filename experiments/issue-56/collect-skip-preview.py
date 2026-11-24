"""Retain the actual preview refusal regression and bounded owned UI evidence."""
import hashlib
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'skip-preview')
parent = 'b3364503e8bfb4989659e0f4a7fc7de57edbff1c'
production = 'js/src/jobs/vacancy-skip-service.js'
for name, fragments in {
    'parent': ['ℹ tests 9', 'ℹ pass 0', 'ℹ fail 9', 'AssertionError'],
    'focused': ['ℹ tests 28', 'ℹ pass 28', 'ℹ fail 0'],
    'focused-final': ['ℹ tests 9', 'ℹ pass 9', 'ℹ fail 0'],
    'native-before': ['AssertionError', 'preview must not create permanent refusals'],
    'format-check': ['All matched files use Prettier code style!'],
    'source-limits': ['0 over the 1500 line limit'],
    'doc-limits': ['All documentation files are within'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['parent', 'native-before']:
    assert 'TypeError' not in read(name) and 'ERR_MODULE_NOT_FOUND' not in read(name)
for name in ['lint', 'secrets', 'whitespace']:
    assert not read(name).strip(), name
native = json.loads(read('native-after').splitlines()[-1])
assert native == dict(refusalReasons=3, previewLedgerUnchanged=True,
    ownerValuesPreserved=True, reloadRetained=True, locales=4,
    providerEntries=0, providerSubmissions=0, browsersClosed=True, liveProvider=False)
inspection = json.loads((logs / 'skip-preview-mcp-result.json').read_text())
receipt = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert receipt == dict(result=[dict(locale=locale, emptyAfterReload=True, translated=True)
    for locale in ['en', 'ru', 'hi', 'zh']], previewLedgerUnchanged=True,
    providerEntries=0, providerSubmissions=0, browsersClosed=True,
    phoneFits=True, errors=[], liveProvider=False)
assert json.loads(read('mcp-server').splitlines()[-1]) == dict(
    resourcesClosed=True, liveProvider=False)
images = sorted((root / 'docs/screenshots/issue-56-skip-preview').glob('*.png'))
assert len(images) == 8
review_path = 'ci-logs/skip-preview-image-review.json'
review = json.loads((root / review_path).read_text())
assert review['reviewed'] is True and review['files'] == {
    str(image.relative_to(root)): hashlib.sha256(image.read_bytes()).hexdigest()
    for image in images}
assert all(image.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') for image in images)
names = set(changed_sources(root, 'a5f90983'))
names.update(evidence_logs(root, 'skip-preview'))
names.update(str(image.relative_to(root)) for image in images)
names.update({
    'ci-logs/skip-preview-mcp-code.js', 'ci-logs/hh-reference-readme.md',
    'experiments/issue-56/evidence_bundle.py',
    'experiments/issue-56/previous-module.mjs',
    'experiments/issue-56/application-fixture.mjs',
    'experiments/issue-56/vacancy-skip-fixture.mjs',
    'experiments/issue-56/application-native-fixture.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/question-browser-probe.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/application-native-request.mjs',
    'js/tests/helpers/vacancy-routes.mjs',
    'js/tests/e2e-job-application-visibility-browser.mjs',
    'js/tests/job-vacancy-skips.test.js',
    'js/tests/job-vacancy-skips-interface.test.js',
})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
entries['before/' + production] = subprocess.check_output(
    ['git', 'show', f'{parent}:{production}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(
    accepted=False, criterion='HH08 remains unfinished', verified=88, unfinished=30,
    parent=parent, reference='fa0991b8c2d0896fb3b4be6c69947f0590094b15',
    limitation='Finite synthetic native observations; full exact-source hosted checks remain required.'
), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-skip-preview.tar.gz', entries)
