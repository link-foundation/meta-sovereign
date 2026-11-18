"""Read only ZIP directory and small release metadata from owned CI artifacts.

Usage: python -B experiments/issue-56/desktop-artifact-metadata.py ARTIFACTS.json OUT
No installer is downloaded or executed. Every HTTP range is bounded to 128 KiB.
The authenticated API redirect and its signed storage URL are never printed.
"""
import io
import json
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request
import zipfile


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, newurl):
        return None


def artifact_url(artifact_id):
    token = subprocess.check_output(['gh', 'auth', 'token'], text=True).strip()
    request = urllib.request.Request(
        f'https://api.github.com/repos/link-foundation/meta-sovereign/actions/artifacts/{artifact_id}/zip',
        headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json'},
    )
    try:
        urllib.request.build_opener(NoRedirect).open(request)
    except urllib.error.HTTPError as response:
        if response.code != 302 or not response.headers.get('Location', '').startswith('https://'):
            raise RuntimeError(f'artifact redirect refused: HTTP {response.code}') from None
        return response.headers['Location']
    raise RuntimeError('artifact API did not return its storage redirect')


class RangeReader(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.position, self.bytes_read = url, size, 0, 0

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        origin = [0, self.position, self.size][whence]
        self.position = origin + offset
        if self.position < 0 or self.position > self.size:
            raise ValueError('seek outside artifact')
        return self.position

    def read(self, count=-1):
        count = self.size - self.position if count < 0 else min(count, self.size - self.position)
        if count == 0:
            return b''
        if count > 131072 or self.bytes_read + count > 524288:
            raise ValueError('metadata range exceeds the finite read budget')
        end = self.position + count - 1
        request = urllib.request.Request(self.url, headers={'Range': f'bytes={self.position}-{end}'})
        try:
            with urllib.request.urlopen(request) as response:
                if response.status != 206 or response.headers.get('Content-Range') != f'bytes {self.position}-{end}/{self.size}':
                    raise RuntimeError('storage refused the exact bounded range')
                data = response.read(count + 1)
        except urllib.error.HTTPError as response:
            raise RuntimeError(f'artifact storage refused: HTTP {response.code}') from None
        if len(data) != count:
            raise RuntimeError('truncated or oversized metadata range')
        self.position += count
        self.bytes_read += count
        return data


def collect(artifacts_file, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    artifacts = json.loads(Path(artifacts_file).read_text())['artifacts']
    summary = []
    for artifact in artifacts:
        if artifact['name'].startswith('desktop-launch-'):
            continue
        if artifact['expired'] or not artifact['name'].startswith('desktop-'):
            raise ValueError('expected a retained desktop package artifact')
        reader = RangeReader(artifact_url(artifact['id']), artifact['size_in_bytes'])
        with zipfile.ZipFile(reader) as archive:
            entries = archive.infolist()
            metadata = [entry for entry in entries if
                        Path(entry.filename).name.startswith(('SHA256SUMS-', 'provenance-'))]
            if len(metadata) != 2:
                raise ValueError('expected exactly two checksum/provenance records')
            for entry in metadata:
                if Path(entry.filename).name != entry.filename or entry.file_size > 65536 or entry.compress_size > 65536:
                    raise ValueError('unexpected metadata path or size')
                (output / entry.filename).write_bytes(archive.read(entry))
        summary.append({
            'id': artifact['id'], 'name': artifact['name'],
            'archiveBytes': artifact['size_in_bytes'], 'fetchedBytes': reader.bytes_read,
            'digest': artifact.get('digest'),
            'files': [{'name': e.filename, 'bytes': e.file_size, 'crc32': f'{e.CRC:08x}'} for e in entries],
        })
        print(artifact['name'], 'metadata bytes fetched:', reader.bytes_read)
    (output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')


if __name__ == '__main__':
    collect(*sys.argv[1:])
