"""Archive finite structured-document regressions and synthetic browser evidence."""
import hashlib
import json
from pathlib import Path
from evidence_bundle import evidence_context, changed_sources, write_hashed_archive

root, logs, read = evidence_context(__file__, 'experience-documents')
for name, count in [('before', 'fail 1'), ('node-final', 'pass 18'),
                    ('existing', 'pass 36'), ('web-refactor', 'pass 17'), ('i18n', 'pass 4')]:
    assert count in read(name), name
for name in ['node-final', 'existing', 'web-refactor', 'i18n']:
    assert 'fail 0' in read(name), name
for name in ['lint-final', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format')
assert '6.48%' in read('duplication') and 'ERROR:' not in read('duplication')
for phase in ['before', 'after']:
    result = json.loads(read(f'mcp-{phase}'))['content'][0]['text']
    value = json.loads(result.split('### Result\n')[1])
    assert value['errors'] == [], phase
    if phase == 'after':
        assert value['nativeReceiptReused'] and value['refusedImportRetainsInput']
        assert value['downloads'] == 2 and value['layout'] == {'viewport': 390, 'width': 390}
        assert set(value['locales']) == {'en', 'ru', 'hi', 'zh'}
console = read('mcp-console-final')
errors = [line for line in console.splitlines() if line.startswith('[ERROR]')]
assert all(('/favicon.ico:1' in line and '404' in line) or
           ('/api/cv/experience/import:1' in line and '503' in line) or
           ('/app.min.js:1' in line and 'ERR_CACHE_WRITE_FAILURE' in line)
           for line in errors)
assert len(errors) <= 5
names = [name for name in changed_sources(root)
         if Path(name).suffix in ['.js', '.mjs', '.py', '.md', '.png']
         and not name.endswith(('app.min.js', '/PLAN.md'))]
source_count = len([name for name in names if not name.endswith('.png')])
names += [f'ci-logs/experience-documents-{name}.log' for name in [
    'before', 'node-final', 'existing', 'web-refactor', 'i18n', 'lint-final',
    'format', 'secrets', 'diff', 'build', 'duplication', 'mcp-before', 'mcp-after',
    'mcp-console-final', 'pr-diff-error',
]]
names += ['ci-logs/experience-documents-parent-checks.json',
          'ci-logs/deno-windows-133167558565.log']
write_hashed_archive(root, root / 'docs/case-studies/issue-56/data/experience-documents.tar.gz',
                     names, {'parent': '3d0ded3d', 'focusedChecks': 18,
                             'existingChecks': 36, 'refactoredWebChecks': 17, 'localeChecks': 4,
                             'liveProvider': False, 'remainingRows': 60,
                             'bundleSha256': hashlib.sha256((root / 'js/src/web/app.min.js').read_bytes()).hexdigest(),
                             'hostedAccepted': False}, source_count)
