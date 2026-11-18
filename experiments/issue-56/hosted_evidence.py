"""Read exact-source hosted workflow and job receipts without running a matrix."""
import json
import ast
import hashlib
import re
import subprocess
import base64
import tarfile


def read_detached_learning(text):
    """Require the actual two-page, full-minute CLI/watcher semantic receipt."""
    text = '\n'.join(re.sub(r'^.*?\d{4}-\d\d-\d\dT[\d:.]+Z ', '', line)
                     for line in text.splitlines())
    found = []
    for match in re.finditer(r'(?m)^\{\s*$', text):
        try:
            value, _ = json.JSONDecoder().raw_decode(text[match.start():])
        except json.JSONDecodeError:
            continue
        if value.get('initiatingCliExited') is True:
            found.append(value)
    assert len(found) == 1
    receipt = found[0]
    assert receipt['ok'] and receipt['submits'] == 1
    assert receipt['unchangedEditMs'] >= 60_000
    before = receipt['beforeSubmit']
    assert before['answerLearning']['tracked'] == 2
    assert before['answerLearning']['saved'] == 0
    stable = receipt['stableBeforeSend']['answerLearning']
    assert stable['saved'] == 1 and stable['last']['kind'] == 'stable-owner-edit'
    assert receipt['reusedWatcher']['watcher']['pid'] == before['watcher']['pid']
    assert receipt['history']['answerLearning']['saved'] == 2
    assert receipt['history']['answerLearning']['failed'] == 0
    assert receipt['stopped']['state'] == 'stopped'
    assert receipt['savedHistory']['source'] == 'saved-checkpoints'
    assert len(receipt['rules']) == 2
    assert all(len(rule['answers']) == 1 and not rule['answers'][0]['approved']
               and rule['answers'][0]['count'] == 1 for rule in receipt['rules'])
    assert '"token":' not in json.dumps(receipt)
    return receipt


def read_workflows(root, sha, slug, entries):
    runs = {}
    for path in sorted((root / 'ci-logs').glob(f'hosted-verification-{slug}-*.json')):
        run = json.loads(path.read_text())
        assert run['headSha'] == sha and run['status'] == 'completed', path
        assert run['conclusion'] == 'success', path
        assert all(job['status'] == 'completed' and job['conclusion'] in
                   ['success', 'skipped'] for job in run['jobs']), path
        assert run['name'] not in runs, 'duplicate workflow'
        runs[run['name']] = run
        entries[str(path.relative_to(root))] = path.read_bytes()
    assert set(runs) == {'Checks and release', 'Desktop release',
                         'Deploy to GitHub Pages', 'Scheduled security audit',
                         'Broken Link Checker'}, 'preserve all five workflows'
    return runs


def read_jobs(root, runs, slug, jobs, entries):
    raw = {}
    receipts = {}
    for tag, (workflow, name) in jobs.items():
        candidates = [job for job in runs[workflow]['jobs'] if job['name'] == name]
        assert len(candidates) == 1, (workflow, name)
        job = candidates[0]
        assert job['conclusion'] == 'success', name
        path = root / 'ci-logs' / f'hosted-{slug}-{tag}.log'
        entries[str(path.relative_to(root))] = path.read_bytes()
        raw[tag] = path.read_text().splitlines()
        receipts[tag] = {
            'id': job['databaseId'], 'name': name,
            'startedAt': job['startedAt'], 'completedAt': job['completedAt'],
            'url': job['url'], 'log': str(path.relative_to(root)),
        }
    return raw, receipts


def source_reader(root, sha, entries):
    def read(name):
        content = subprocess.check_output(['git', 'show', f'{sha}:{name}'], cwd=root)
        entries[name] = content
        return content.decode()
    return read


def read_catalog_audit(root, sha, prefix, catalog, source, entries):
    logs = root / 'ci-logs'
    audit = json.loads((logs / f'{prefix}-source-audit.json').read_text())
    assert audit['revision'] == sha and set(audit['archives']) == set(catalog)
    for name, archive in audit['archives'].items():
        path = root / 'docs/case-studies/issue-56/data' / f'{name}.tar.gz'
        assert hashlib.sha256(path.read_bytes()).hexdigest() == archive['archiveSha256']
        manifest = path.with_suffix('').with_suffix('.tar.sha256.json')
        assert hashlib.sha256(manifest.read_bytes()).hexdigest() == archive['manifestSha256']
        entries[str(manifest.relative_to(root))] = manifest.read_bytes()
        for path, hashes in archive['sources'].items():
            assert hashlib.sha256(source(path).encode()).hexdigest() == hashes['current'], path
    for suffix in ['source-audit.json', 'source-deltas.diff']:
        name = f'ci-logs/{prefix}-{suffix}'
        entries[name] = (root / name).read_bytes()
    return audit


def read_literal_tests(stems, source, lines, call='test'):
    assert call in ['test', 'it']
    literal = re.compile(r'''\b''' + call + r'''\(\s*((?:'(?:\\.|[^'\\])*')|(?:"(?:\\.|[^"\\])*"))\s*,''')
    tests = {}
    for stem in sorted(stems):
        path = f'js/tests/{stem}.test.js'
        content = source(path)
        assert not re.search(r'\b' + call + r'\(\s*`', content), f'expand dynamic names: {path}'
        names = [ast.literal_eval(match.group(1)) for match in literal.finditer(content)]
        assert names and len(names) == len(set(names)), path
        tests[path] = {}
        for name in names:
            matches = [i for i, line in enumerate(lines, 1) if f'✔ {name} (' in line]
            assert len(matches) == 1, (name, matches)
            tests[path][name] = matches[0]
    assert any('ℹ fail 0' in line for line in lines)
    return tests


def read_reference_contracts(root, selection, entries, revision):
    references = {}
    for archive_name, paths in selection.items():
        archive_path = root / 'docs/case-studies/issue-56/data' / f'{archive_name}.tar.gz'
        archive = tarfile.open(archive_path) if archive_name else None
        try:
            for path in paths:
                response = archive.extractfile(path).read() if archive else (root / path).read_bytes()
                reference = json.loads(response)
                content = base64.b64decode(reference['content'])
                blob = b'blob ' + str(len(content)).encode() + b'\0' + content
                assert hashlib.sha1(blob).hexdigest() == reference['sha'], path
                assert revision in reference['html_url'], path
                entries[path] = response
                entries[f'references/{reference["path"]}'] = content
                references[reference['path']] = dict(url=reference['html_url'], blob=reference['sha'])
        finally:
            if archive:
                archive.close()
    return references
