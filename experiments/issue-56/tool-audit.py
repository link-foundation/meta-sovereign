"""Read primary release metadata, never execute downloaded source or installers."""

import json
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone
from urllib.request import urlopen


def github(path):
    return json.loads(subprocess.check_output(["gh", "api", path], text=True))


actions = {}
for file in Path(".github").rglob("*.yml"):
    for name, pin in re.findall(r"uses:\s+([\w-]+/[\w.-]+)(?:/[\w/-]+)?@([\w.-]+)", file.read_text()):
        actions.setdefault(name, set()).add(pin)
result = {"checkedAt": datetime.now(timezone.utc).isoformat(), "actions": []}
for name, pins in sorted(actions.items()):
    if name == "dtolnay/rust-toolchain":
        release = github(f"repos/{name}/commits/stable")
        latest = release["sha"]
        url = release["html_url"]
    elif name == "github/codeql-action":
        # The repository's latest release is the CodeQL bundle, not the action.
        refs = github(f"repos/{name}/git/matching-refs/tags/v4.")
        latest = max((item["ref"].split("/")[-1] for item in refs if re.fullmatch(r"refs/tags/v4\.\d+\.\d+", item["ref"])), key=lambda tag: tuple(map(int, tag[1:].split("."))))
        url = f"https://github.com/{name}/releases/tag/{latest}"
    else:
        release = github(f"repos/{name}/releases/latest")
        latest = release["tag_name"]
        url = release["html_url"]
    row = {"name": name, "declared": sorted(pins), "latest": latest, "source": url}
    if latest.startswith("v") and any(len(pin) == 40 for pin in pins):
        ref = github(f"repos/{name}/git/ref/tags/{latest}")["object"]
        if ref["type"] == "tag":
            ref = github(f"repos/{name}/git/tags/{ref['sha']}")["object"]
        row["latestSha"] = ref["sha"]
    result["actions"].append(row)

result["runtimes"] = []
with urlopen("https://nodejs.org/dist/index.json") as response:
    nodes = json.load(response)
result["runtimes"].append({"name": "node", "latest": next(item["version"] for item in nodes if "-" not in item["version"]), "source": "https://nodejs.org/dist/index.json"})
for name, repo in [("bun", "oven-sh/bun"), ("deno", "denoland/deno"), ("rust", "rust-lang/rust"), ("swift", "swiftlang/swift")]:
    release = github(f"repos/{repo}/releases/latest")
    result["runtimes"].append({"name": name, "latest": release["tag_name"], "source": release["html_url"]})
release = github("repos/swiftlang/swiftly/releases/latest")
result["runtimes"].append({"name": "swiftly", "latest": release["tag_name"], "source": release["html_url"]})
for name, url, keys in [
    ("npm", "https://registry.npmjs.org/npm/latest", ["version"]),
    ("zizmor", "https://pypi.org/pypi/zizmor/json", ["info", "version"]),
    ("cargo-audit", "https://crates.io/api/v1/crates/cargo-audit", ["crate", "max_stable_version"]),
]:
    with urlopen(url) as response:
        value = json.load(response)
    for key in keys:
        value = value[key]
    result["runtimes"].append({"name": name, "latest": value, "source": url})
python_url = "https://www.python.org/api/v2/downloads/release/"
with urlopen(python_url) as response:
    releases = json.load(response)
versions = [row["name"].split()[1] for row in releases if row["is_published"] and not row["pre_release"] and re.fullmatch(r"Python \d+\.\d+\.\d+", row["name"])]
result["runtimes"].append({"name": "python", "latest": max(versions, key=lambda version: tuple(map(int, version.split(".")))), "source": python_url})
with urlopen("https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/node:pull") as response:
    token = json.load(response)["token"]
from urllib.request import Request

tag = next(row["latest"][1:] for row in result["runtimes"] if row["name"] == "node") + "-alpine"
url = f"https://registry-1.docker.io/v2/library/node/manifests/{tag}"
request = Request(url, method="HEAD", headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json"})
with urlopen(request) as response:
    result["docker"] = {"image": f"node:{tag}", "digest": response.headers["Docker-Content-Digest"], "source": url}
print(json.dumps(result, indent=2))
