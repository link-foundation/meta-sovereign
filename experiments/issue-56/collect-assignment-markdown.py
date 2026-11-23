"""Preserve the literal Markdown and document-refusal regressions."""
import json

from evidence_bundle import bundle, evidence_context


root, _, read = evidence_context(__file__, 'linked-markdown')
parent = 'd48ef4e2d6c4cddaab0a5e74e3a4978724c43496'
assert 'FAIL (chromium)' in read('parent')
assert '(assignment-source-unreadable)' in read('parent')
assert "code: 'assignment-unconfirmed'" in read('ui-refusal-parent')
for engine in ('chromium', 'webkit'):
    log = read(f'final-{engine}')
    assert f'OK ({engine})' in log and '"unreadableRefusals":1' in log
    assert '"modelCalls":1' in log and '"submissions":0' in log
assert 'pass 27' in read('final-node')
assert '27 passed | 0 failed' in read('final-deno')
assert '"format":"html"' in read('html-control')
for name in ('lint', 'secretlint', 'diff'):
    assert not read(name).strip(), name

proof_path = 'ci-logs/linked-markdown-mcp.json'
proof = json.loads((root / proof_path).read_text())
assert proof['browser']['errors'] == []
assert proof['browser']['width'] == {'viewport': 390, 'content': 390}
assert proof['browser']['requests'] == ['draft']
assert proof['browser']['resolved'].endswith('/markdown-instructions')
assert proof['mcpClosed'] and proof['ownedFixture'] == {
    'forms': [{'value': '', 'closed': True}], 'sources': [True],
    'modelCalls': 1, 'externalWrites': False, 'submissions': 0,
}
probe_paths = [f'ci-logs/assignment-document-types-{phase}.log'
               for phase in ('parent', 'current')]
for phase, probe_path in enumerate(probe_paths):
    documents = {row['contentType']: row for row in map(
        json.loads, (root / probe_path).read_text().splitlines())}
    assert documents['text/plain']['receipt']['complete']
    assert documents['text/markdown']['receipt']['complete'] == bool(phase)
    assert not documents['application/pdf']['receipt']['complete']

production = [
    'js/src/assignments/source-document.js',
    'js/src/web/form-assignment-publisher-api.js',
    'js/src/web/form-assignment-publisher.js',
    *[f'js/src/web/locales/{language}-assignment.js'
      for language in ('en', 'hi', 'ru', 'zh')],
]
sources = production + [
    'experiments/issue-56/assignment-document-types.mjs',
    'experiments/issue-56/assignment-linked-mcp-fixture.mjs',
    'experiments/issue-56/assignment-linked-mcp.mjs',
    'experiments/issue-56/assignment-source-fixture.mjs',
    'experiments/issue-56/collect-assignment-markdown.py',
    'experiments/issue-56/forms-reader-fixture.mjs',
    'js/tests/assignment-source.test.js',
    'js/tests/e2e-forms-reader-browser.mjs',
    'js/tests/helpers/e2e-assignment-publication.mjs',
]
logs = [f'ci-logs/linked-markdown-{name}.log' for name in (
    'parent', 'ui-refusal-parent', 'final-chromium', 'final-webkit',
    'final-node', 'final-deno', 'html-control', 'lint', 'secretlint', 'diff',
    'format-check', 'build')]
bundle(root, sources + logs + probe_paths + [proof_path],
       'docs/case-studies/issue-56/data/assignment-linked-markdown.tar.gz',
       dict(parent=parent, criterion='QA24', criterionComplete=False,
            nodeChecks=27, denoChecks=27, embeddedRequests=0,
            unreadableRefusals=1, authenticatedProvider=False),
       'issue-56-assignment-source-linked-markdown-*.png',
       {name: parent for name in production})
