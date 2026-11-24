"""Collect immutable, read-only reference sources and issue research metadata.

Reference checkouts stay outside the repository and are never executed.
Run: python3 -B experiments/issue-56/collect.py
"""

import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/case-studies/issue-56/evidence/research"
REFERENCES = Path(tempfile.gettempdir()) / "meta-sovereign-issue-56-references"
REPOS = [
    "konard/hh-job-application-automation",
    "konard/broadcast",
    "konard/telegram-bot",
    "konard/follow",
    "konard/vk-bot",
    "konard/vk-bot-desktop",
    "link-foundation/browser-commander",
    "link-foundation/link-cli",
    "link-foundation/lino-rest-api",
    "link-assistant/formal-ai",
]


def api(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", endpoint], text=True))


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def collect(repo):
    metadata = api(f"repos/{repo}")
    commit = api(f"repos/{repo}/commits/{metadata['default_branch']}")
    sha = commit["sha"]
    folder = EVIDENCE / repo.replace("/", "--")
    save(folder / "repository.json", metadata)
    save(folder / "commit.json", commit)
    tree = api(f"repos/{repo}/git/trees/{sha}?recursive=1")
    save(folder / "tree.json", tree)
    target = REFERENCES / repo.replace("/", "--")
    target.mkdir(parents=True, exist_ok=True)
    if repo == "link-assistant/formal-ai":
        # This repository contains over a gigabyte of history/assets. Only
        # inspect the stack document and packaging sources relevant here.
        names = [
            item["path"] for item in tree["tree"]
            if item["type"] == "blob" and (
                item["path"] in ["docs/associative-tech-stack.md", "package.json", "README.md"]
                or item["path"].startswith((".github/workflows/", "scripts/"))
            ) and item.get("size", 0) < 200_000
        ]
        for name in names:
            url = f"https://raw.githubusercontent.com/{repo}/{sha}/{name}"
            path = target / name
            path.parent.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(url) as response:
                path.write_bytes(response.read())
    else:
        # Stream extraction: do not retain redundant archives or unpack assets.
        url = f"https://codeload.github.com/{repo}/tar.gz/{sha}"
        with urllib.request.urlopen(url) as response:
            with tarfile.open(fileobj=response, mode="r|gz") as archive:
                for member in archive:
                    if not member.isfile() or member.size > 2_000_000:
                        continue
                    relative = Path(*Path(member.name).parts[1:])
                    if ".." in relative.parts or relative.is_absolute():
                        raise ValueError("unsafe archive member")
                    if relative.suffix.lower() not in {
                        ".md", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
                        ".json", ".yml", ".yaml", ".toml", ".rs", ".py", ".html",
                        ".css", ".sh", ".txt", ".lino",
                    }:
                        continue
                    path = target / relative
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(archive.extractfile(member).read())
    readme = target / "README.md"
    if readme.exists():
        (folder / "README.md").write_bytes(readme.read_bytes())
    print(f"{repo} {sha} {target}", flush=True)


if __name__ == "__main__":
    for name in REPOS:
        collect(name)
