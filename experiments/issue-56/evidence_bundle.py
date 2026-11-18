"""Stage verified case-study evidence, source snapshots and screenshot hashes."""
import gzip
import hashlib
import io
import json
import re
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile
import tarfile


def evidence_context(script, prefix):
    """Share root-relative log reads across the finite evidence collectors."""
    root = Path(script).resolve().parents[2]
    logs = root / 'ci-logs'
    def read(name):
        return (logs / f'{prefix}-{name}.log').read_text()
    return root, logs, read


def changed_sources(root, revision=None):
    """Capture the same working sources without recursively archiving evidence."""
    changed = subprocess.check_output([
        'git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
        cwd=root).decode().split('\0')
    changed += subprocess.check_output([
        'git', 'diff', '--name-only', '-z', *([revision] if revision else ['--cached'])],
        cwd=root).decode().split('\0')
    return sorted(set(name for name in changed if name and not name.startswith(
        'docs/case-studies/issue-56/data/')))


def evidence_logs(root, prefix, suffixes=('.log', '.json')):
    return [str(path.relative_to(root)) for path in (root / 'ci-logs').glob(f'{prefix}-*')
            if path.is_file() and path.suffix in suffixes
            and not path.name.endswith(('-commit.log', '-push.log', '-archive.log', '-pr.log'))]


def verify_evidence(read, checks, empty=('lint-final', 'secrets', 'diff')):
    """Require successful finite checks and the unchanged duplication gate."""
    for name, fragments in checks.items():
        assert all(fragment in read(name) for fragment in fragments), name
    for name in empty:
        assert not read(name).strip(), name
    duplication = read('duplication')
    total = next(line for line in duplication.splitlines() if 'Total:' in line)
    percentages = re.findall(r'([\d.]+)%', total)
    assert percentages and float(percentages[0]) <= 6.5, percentages
    assert 'ERROR:' not in duplication, 'duplication threshold failed'


def bundle(root, sources, destination, metadata, screenshot_pattern, before=None):
    root = Path(root)
    helper = 'experiments/issue-56/evidence_bundle.py'
    archiver = 'experiments/issue-56/archive-evidence.py'
    metadata = dict(metadata, screenshots={
        image.name: hashlib.sha256(image.read_bytes()).hexdigest()
        for image in sorted((root / 'docs/screenshots').glob(screenshot_pattern))
    })
    write_archive = runpy.run_path(str(root / archiver))['archive']
    with tempfile.TemporaryDirectory(prefix='issue-56-evidence-') as temporary:
        stage = Path(temporary)
        for name in dict.fromkeys([*sources, helper, archiver]):
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / name, target)
        for name, revision in (before or {}).items():
            target = stage / 'before' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(subprocess.check_output(
                ['git', 'show', f'{revision}:{name}'], cwd=root))
        (stage / 'metadata.json').write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + '\n')
        write_archive(stage, root / destination)


def write_hashed_archive(root, archive, names, metadata, source_count):
    """Write deterministic named evidence and verify every archived byte."""
    entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
    entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
    write_entries_archive(archive, entries, source_count)


def write_entries_archive(archive, entries, source_count=None):
    """Share the existing ordered byte-entry writer across evidence collectors."""
    with archive.open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as tar:
                for name, data in entries.items():
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    tar.addfile(entry, io.BytesIO(data))
    with tarfile.open(archive, 'r:gz') as tar:
        hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest()
                  for entry in tar.getmembers() if entry.isfile()}
    assert hashes == {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()}
    archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(
        json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
    suffix = '' if source_count is None else f' and {source_count} source hashes'
    print(f'Verified {len(hashes)} archive entries{suffix}')


def verify_vk_reply_inspection(logs, result_name, server_name):
    """Require translated, stable private previews and drained owned fixtures."""
    inspection = json.loads((logs / result_name).read_text())
    summary = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert [item['language'] for item in summary['result']] == ['en', 'ru', 'hi', 'zh']
    assert all(item['translated'] and item['retainedVariants'] and item['privateReplies'] == 2
               and item['stableAlternatives'] for item in summary['result'])
    assert summary['exceptions'] == [] and summary['liveProvider'] is False
    assert json.loads((logs / server_name).read_text().splitlines()[-1]) == {
        'sends': 0, 'liveProvider': False, 'resourcesClosed': True,
    }


def verify_salary_watch_mcp(logs, prefix, phase, sent):
    """Require the native choice receipt and complete owned-fixture cleanup."""
    result = json.loads((logs / f'{prefix}-mcp-{phase}.json').read_text())
    receipt = json.loads(result['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
    assert receipt['phase'] == ('sent' if sent else 'review')
    if sent:
        assert receipt['receipt']['messageId'] == '102'
    else:
        assert receipt['receipt'] is None and receipt['option'] is None
    server = json.loads((logs / f'{prefix}-mcp-{phase}-server.log').read_text().splitlines()[-1])
    assert server['resourcesClosed'] and not server['liveProvider']
    assert server['stats'] == {'clicks': int(sent), 'textSends': 0, 'draft': ''}
    return receipt


def verify_salary_draft_mcp(logs, prefix, phase, expected, currency='USD', basis='gross',
                            parent_fragment='"match":"unanswered"'):
    """Require a refused parent or acknowledged draft and drained owned fixture."""
    response = json.loads((logs / f'{prefix}-mcp-{phase}.json').read_text())
    text = response['content'][0]['text']
    if phase == 'before':
        assert response['isError'] and parent_fragment in text
    else:
        result = json.loads(text.split('### Result\n', 1)[1].split('\n###', 1)[0])
        assert result == dict(text=expected, currency=currency, basis=basis,
                              status='review', prefilled=True, draftExists=True)
    server = json.loads((logs / f'{prefix}-mcp-{phase}-server.log').read_text().splitlines()[-1])
    assert server['resourcesClosed'] and not server['liveProvider']
    assert server['stats'] == dict(clicks=0, textSends=0,
                                   draft=expected if phase == 'after' else '')
    return server


def parent_reply_sources(root, sources, parent):
    """Keep exact tracked production parent bytes alongside a reply evidence unit."""
    before = {}
    for name in sources:
        if name.startswith('js/src/') and subprocess.run(
                ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            before[name] = parent
    before['js/src/web/app.min.js'] = parent
    return before
