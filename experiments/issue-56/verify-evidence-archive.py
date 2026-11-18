"""Compare the shared archive writer with a frozen, published collector."""
import contextlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
from evidence_bundle import write_hashed_archive

root = Path(__file__).resolve().parents[2]
frozen = root / 'docs/case-studies/issue-56/data/ci-export-defaults.tar.gz'
with tarfile.open(frozen, 'r:gz') as tar:
    reference = tar.extractfile(
        'experiments/issue-56/collect-ci-export-defaults.py').read().decode()
start = "with archive.open('wb') as raw:"
reference = compile(start + reference.split(start, 1)[1], '<published-writer>', 'exec')

with tempfile.TemporaryDirectory(prefix='evidence-writer-check-') as temporary:
    folder = Path(temporary)
    (folder / 'a.log').write_bytes(b'finite fixture\n\x00\xff')
    (folder / 'b.json').write_text('{"message":"नमस्ते"}\n')
    for names in [[], ['a.log', 'a.log'], ['b.json', 'a.log'], ['missing.log']]:
        archive = folder / 'fixture.tar.gz'
        metadata = {'fixture': True, 'message': 'नमस्ते', 'sources': {}}
        results = []
        for original in [True, False]:
            output = io.StringIO()
            try:
                with contextlib.redirect_stdout(output):
                    if original:
                        exec(reference, dict(root=folder, archive=archive,
                             names=names, metadata=metadata, sources=[],
                             gzip=__import__('gzip'), hashlib=__import__('hashlib'),
                             tarfile=tarfile, io=io, json=json))
                    else:
                        write_hashed_archive(folder, archive, names, metadata, 0)
                results.append((archive.read_bytes(),
                                archive.with_suffix('').with_suffix('.tar.sha256.json').read_bytes(),
                                output.getvalue()))
            except FileNotFoundError:
                results.append('missing-source-refused')
        assert results[0] == results[1], names
        if 'missing.log' in names:
            assert results[1] == 'missing-source-refused'
print('PASS: four bounded cases preserve archive bytes, hashes, output and missing-file refusal')
