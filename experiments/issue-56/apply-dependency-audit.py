"""Apply the reviewed primary metadata snapshots without executing packages."""

import json
from pathlib import Path
import re

dependencies = json.loads(Path("/tmp/issue-56-dependencies.json").read_text())
tools = json.loads(Path("/tmp/issue-56-tools.json").read_text())
manifest_path = Path("package.json")
manifest = json.loads(manifest_path.read_text())
for row in dependencies["results"]:
    for declared in row["declared"]:
        constraint = declared["constraint"]
        prefix = constraint[0] if constraint.startswith(("^", "~")) else ""
        manifest[declared["group"]][row["name"]] = prefix + row["latest"]
    if row["name"] == "lino-rest-api":
        manifest["dependencies"][row["name"]] = "^" + row["latest"]
versions = {row["name"]: row["latest"] for row in tools["runtimes"]}
manifest["packageManager"] = "npm@" + versions["npm"]
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
for file in [*Path(".github").rglob("*.yml"), *Path("docker").glob("*.Dockerfile")]:
    text = file.read_text()
    text = text.replace("26.12.1", versions["node"].removeprefix("v"))
    text = text.replace("npm@12.2.1", "npm@" + versions["npm"])
    text = text.replace("6.4.1", versions["swift"].removeprefix("swift-").removesuffix("-RELEASE"))
    text = text.replace("zizmor==1.31.1", "zizmor==" + versions["zizmor"])
    text = text.replace("cargo-audit@0.22.2", "cargo-audit@" + versions["cargo-audit"])
    text = re.sub(r"python-version: '[\d.]+'", f"python-version: '{versions['python']}'", text)
    for action in tools["actions"]:
        for pin in action["declared"]:
            latest = action.get("latestSha", action["latest"])
            text = re.sub(rf"({re.escape(action['name'])}(?:/[\w/-]+)?)@{re.escape(pin)}\b", rf"\g<1>@{latest}", text)
            if latest != pin and len(pin) == 40:
                text = re.sub(rf"({re.escape(action['name'])}@{latest} # )v[\d.]+", rf"\g<1>{action['latest']}", text)
    if file.suffix == ".Dockerfile":
        text = re.sub(r"FROM node:[^\n]+", f"FROM {tools['docker']['image']}@{tools['docker']['digest']}", text)
    file.write_text(text)
deno = Path("deno.json")
teleproto = next(row["latest"] for row in dependencies["results"] if row["name"] == "teleproto")
deno.write_text(re.sub(r"npm:teleproto@[\d.]+", "npm:teleproto@" + teleproto, deno.read_text()))
