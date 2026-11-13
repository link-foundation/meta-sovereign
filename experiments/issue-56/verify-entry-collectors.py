"""Compare fourteen published archive writers with the shared byte-entry writer."""
import contextlib
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='entry-writer-check-') as directory:
    folder = Path(directory)
    (folder / 'a.log').write_bytes(b'finite fixture\n\x00\xff')
    (folder / 'b.json').write_text('{"message":"नमस्ते"}\n')
    archives = {
        'forms-reader': 'forms-reader', 'forms-journal': 'forms-review-journal',
        'forms-sessions': 'forms-review-sessions', 'links-concurrency': 'ci-links-concurrency',
        'forms-monitor': 'forms-automatic-capture', 'browser-apt': 'browser-apt',
        'forms-prefill': 'forms-reviewed-prefill', 'forms-radio': 'forms-reviewed-radios',
        'forms-upload': 'forms-reviewed-upload', 'forms-learning': 'forms-answer-learning',
        'forms-choices': 'forms-reviewed-choices', 'forms-custom': 'forms-reviewed-custom',
        'forms-watchers': 'forms-detached-watchers', 'forms-configured-resume': 'forms-configured-resume',
    }
    for name, frozen in archives.items():
        with tarfile.open(root / f'docs/case-studies/issue-56/data/{frozen}.tar.gz', 'r:gz') as tar:
            source = tar.extractfile(f'experiments/issue-56/collect-{name}.py').read().decode()
        marker = "with archive.open('wb') as "
        reference = compile(marker + source.split(marker, 1)[1], name, 'exec')
        for names in [[], ['b.json', 'a.log', 'a.log']]:
            archive = folder / 'fixture.tar.gz'
            metadata = {'fixture': True, 'message': 'नमस्ते'}
            entries = {n: (folder / n).read_bytes() for n in sorted(set(names))}
            entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
            results = []
            for original in [True, False]:
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    if original:
                        exec(reference, dict(archive=archive, entries=entries, root=folder,
                            names=names, metadata=metadata, sources=['a', 'b'], gzip=gzip,
                            hashlib=hashlib, io=io, json=json, tarfile=tarfile))
                    else:
                        count = 2 if 'source hashes' in source else None
                        write_entries_archive(archive, entries, count)
                results.append((archive.read_bytes(), output.getvalue(),
                    archive.with_suffix('').with_suffix('.tar.sha256.json').read_bytes()))
            assert results[0] == results[1], (name, names)
print('PASS: twenty-eight finite comparisons preserve fourteen collectors, archive bytes, manifests and output')
