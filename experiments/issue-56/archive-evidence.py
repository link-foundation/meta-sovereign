"""Archive downloaded evidence with per-file hashes; never execute references.

Run from the repository root:
  python3 -B experiments/issue-56/archive-evidence.py SOURCE DESTINATION.tar.gz
The source is retained so checksums can be compared independently.
"""

import hashlib
import json
from pathlib import Path
import sys
import tarfile


def archive(source, destination):
    source = Path(source)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    manifest = {}
    with tarfile.open(destination, "w:gz", compresslevel=6) as output:
        for path in sorted(source.rglob("*")):
            if not path.is_file():
                continue
            name = path.relative_to(source).as_posix()
            with path.open("rb") as content:
                manifest[name] = hashlib.file_digest(content, "sha256").hexdigest()
            info = output.gettarinfo(path, arcname=name)
            info.uid = info.gid = info.mtime = 0
            info.uname = info.gname = ""
            with path.open("rb") as content:
                output.addfile(info, content)
    # Verify every archived byte before it becomes review evidence.
    with tarfile.open(destination) as saved:
        for member in saved:
            with saved.extractfile(member) as content:
                assert hashlib.file_digest(content, "sha256").hexdigest() == manifest[member.name]
    destination.with_suffix(".sha256.json").write_text(
        json.dumps({"archive": destination.name, "files": manifest}, indent=2) + "\n"
    )
    print(f"Verified {len(manifest)} files: {destination}")


if __name__ == "__main__":
    archive(*sys.argv[1:])
