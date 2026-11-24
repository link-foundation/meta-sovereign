"""Verify and archive the linked PDF assignment reproduction."""
import hashlib
import json

from evidence_bundle import bundle, evidence_context


root, logs, read = evidence_context(__file__, 'assignment-pdf')
parent = '1b31e592cdd62362a40b12462c16eff10a1f89e2'
assert 'fail 4' in read('parent-test')
assert 'FAIL (chromium)' in read('parent-browser')
assert 'assignment-source-unavailable' in read('parent-browser')
for engine in ('chromium', 'webkit'):
    final = read(f'final-{engine}')
    assert f'OK ({engine})' in final
    assert all(value in final for value in (
        '"format":"pdf"', '"modelCalls":1', '"unreadableRefusals":1',
        '"sourceClosed":true', '"submissions":0'))
    response = read(f'response-{engine}')
    assert '"exactAuthenticatedBytes":true' in response
    assert '"rejectedInvalidResponses":5' in response
    assert '"resourcesClosed":true' in response
assert 'pass 32' in read('focused-node')
assert '32 passed | 0 failed' in read('focused-deno')
assert '4 pass' in read('focused-bun') and '0 fail' in read('focused-bun')
assert 'found 0 vulnerabilities' in read('audit')
for name in ('lint-final', 'secrets', 'diff'):
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-final')

mcp = json.loads((logs / 'assignment-pdf-mcp.json').read_text())
assert mcp['mcpClosed']
assert mcp['browser']['requests'] == ['draft'] and mcp['browser']['errors'] == []
assert mcp['browser']['resolved'].endswith('/pdf-instructions')
assert mcp['browser']['width'] == {'viewport': 390, 'content': 390}
fixture = json.loads(read('mcp-fixture').splitlines()[-1])
assert fixture == {
    'forms': [{'value': '', 'closed': True}], 'sources': [True],
    'modelCalls': 1, 'externalWrites': False, 'submissions': 0,
}

production = [
    'js/src/assignments/read-page.js',
    'js/src/assignments/source-reader.js',
    'js/src/assignments/source.js',
    'js/src/web/form-assignment-publisher.js',
    'js/src/web/form-assignment-publisher-api.js',
    *[f'js/src/web/locales/{language}-assignment.js'
      for language in ('en', 'hi', 'ru', 'zh')],
]
sources = production + [
    *[f'js/src/assignments/source-pdf{suffix}.js'
      for suffix in ('', '-bytes', '-worker')],
    'experiments/issue-56/collect-assignment-pdf.py',
    'experiments/issue-56/assignment-linked-mcp-fixture.mjs',
    'experiments/issue-56/assignment-linked-mcp.mjs',
    'experiments/issue-56/assignment-pdf-fixture.mjs',
    'experiments/issue-56/assignment-pdf-parent.mjs',
    'experiments/issue-56/assignment-pdf-response.mjs',
    'experiments/issue-56/assignment-source-fixture.mjs',
    'experiments/issue-56/forms-reader-fixture.mjs',
    'js/tests/assignment-pdf.test.js',
    'js/tests/assignment-source.test.js',
    'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-assignment-publication.mjs',
    'package-lock.json',
    'package.json',
]
evidence = [f'ci-logs/assignment-pdf-{name}.log' for name in (
    'audit', 'build-web', 'diff', 'final-chromium', 'final-webkit', 'focused-node',
    'focused-deno', 'focused-bun', 'format-final', 'lint-final', 'mcp-fixture',
    'parent-browser', 'parent-test', 'response-chromium', 'response-webkit',
    'secrets', 'webkit-native-order')]
evidence += [f'ci-logs/assignment-pdf-{name}.json'
             for name in ('mcp', 'npm-pack', 'serverless')]
with (root / 'js/src/web/app.min.js').open('rb') as web_bundle:
    web_digest = hashlib.file_digest(web_bundle, 'sha256').hexdigest()
bundle(root, sources + evidence,
       'docs/case-studies/issue-56/data/assignment-linked-pdf.tar.gz',
       dict(parent=parent, criterion='QA24', criterionComplete=False,
            bundleSHA256=web_digest, nodeChecks=32, denoChecks=32, bunChecks=4,
            readablePages=2, submissions=0, authenticatedProvider=False),
       'issue-56-assignment-source-linked-pdf-*.png',
       {name: parent for name in production})
