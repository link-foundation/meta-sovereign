"""Reproducibly package one reviewed security patch over npm picomatch 4.0.7."""
import difflib
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile

root = Path(__file__).resolve().parents[2]
source = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'ci-logs/picomatch-4.0.7.tgz'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '697b463be3cdbd9ffc8f4194fd5019a69ddf95875fb703d78b2b115cc9e740a8'
destination = root / 'vendor/picomatch'
destination.mkdir(parents=True, exist_ok=True)
names = ['index.js', 'posix.js', 'lib/parse.js', 'lib/utils.js', 'lib/constants.js',
         'lib/picomatch.js', 'lib/scan.js', 'LICENSE', 'package.json']
with tarfile.open(source) as archive:
    entries = {name: archive.extractfile(f'package/{name}').read() for name in names}
before = {name: hashlib.sha256(value).hexdigest() for name, value in entries.items()}
parser = entries['lib/parse.js'].decode()
needle = "    let output = token.close + (opts.capture ? ')' : '');"
replacement = """    // A single wildcard branch is closed under concatenation: P*S repeated
    // one or more times still matches P*S. Remove the outer repeat instead of
    // nesting its unbounded quantifier around the wildcard's own quantifier.
    const bodyTokens = tokens.slice(token.tokensIndex + 2);
    const singleWildcard = opts.maxExtglobRecursion !== false &&
      (token.type === 'plus' || token.type === 'star') &&
      splitTopLevel(body).length === 1 &&
      bodyTokens.some(part => part.type === 'star' && !part.extglob) &&
      bodyTokens.every(part => !part.extglob && !part.suffix &&
        (part.type === 'text' || part.type === 'star' || part.type === 'qmark' || part.type === 'bracket'));
    let output = (singleWildcard ? (token.type === 'star' ? ')?' : ')') : token.close) + (opts.capture ? ')' : '');"""
assert parser.count(needle) == 1
patched = parser.replace(needle, replacement)
entries['lib/parse.js'] = patched.encode()
(destination / 'security.patch').write_text(''.join(difflib.unified_diff(
    parser.splitlines(True), patched.splitlines(True),
    fromfile='a/lib/parse.js', tofile='b/lib/parse.js', n=0)))
package = json.loads(entries['package.json'])
package.update(name='meta-sovereign-picomatch', version='4.0.7+patched.1', private=True,
    description='Private picomatch 4.0.7 security fork for meta-sovereign; see provenance.json')
package.pop('scripts', None)
package.pop('devDependencies', None)
entries['package.json'] = (json.dumps(package, indent=2) + '\n').encode()
(destination / 'LICENSE').write_bytes(entries['LICENSE'])
target = destination / 'picomatch-4.0.7-patched.1.tgz'
with target.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as archive:
            for name, value in sorted(entries.items()):
                member = tarfile.TarInfo(f'package/{name}')
                member.size = len(value)
                member.mode = 0o644
                archive.addfile(member, io.BytesIO(value))
with tarfile.open(target) as archive:
    actual = {member.name.removeprefix('package/'): archive.extractfile(member).read()
              for member in archive.getmembers()}
assert actual == entries
provenance = dict(upstream='https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz',
    upstreamSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    patch='https://github.com/micromatch/picomatch/pull/254',
    reviewedPatchCommit='c63a5bf4e61dbdb81bc41e97dc2616c30acce337',
    advisory='https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
    archiveSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
    before=before, after={name: hashlib.sha256(value).hexdigest() for name, value in entries.items()})
(destination / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print(f'Verified {len(entries)} vendored entries; only parser and package metadata differ')
