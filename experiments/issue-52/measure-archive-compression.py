"""Measure XZ evidence compression with finite input and a 512 MiB limit.

For the original input, save the evidence.tar.gz blob from commit b7b355cd to
a temporary file and pass that path as the optional positional argument.
"""

import argparse
import gzip
import lzma
from pathlib import Path
import resource
import shutil
import tempfile

resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', nargs='?', type=Path,
                    default=root / 'dev/log/issues/52/pulls/53/evidence.tar.gz')
source = parser.parse_args().source
with tempfile.TemporaryDirectory(prefix='issue52-compression-') as folder:
    destination = Path(folder) / 'evidence.tar.xz'
    with gzip.open(source, 'rb') as reader:
        with lzma.open(destination, 'wb', preset=6) as writer:
            shutil.copyfileobj(reader, writer, length=64 * 1024)
    print(f'Gzip: {source.stat().st_size} bytes')
    print(f'XZ: {destination.stat().st_size} bytes')
    assert destination.stat().st_size < 50 * 1024 * 1024
