"""Compare complete immutable template trees, retaining every file decision."""

from collections import Counter
import difflib
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'dev/log/issues/54/pulls/55'


def counterpart(path):
    candidates = [path]
    if path.startswith(('scripts/', 'tests/', 'src/')):
        candidates.insert(0, 'js/' + path)
    for candidate in candidates:
        if (ROOT / candidate).is_file():
            return candidate
    return None


def decision(path, match):
    if match:
        return 'Compare implementation/configuration with local counterpart'
    if path.startswith(('.github/actions/publish', '.github/actions/setup-buildx')):
        return 'Registry-image publishing: not a current product publication target'
    if path.startswith('.github/workflows/'):
        return 'Workflow role mapped in TEMPLATE-COMPARISON.md'
    if path.startswith('scripts/'):
        return 'Script role mapped in TEMPLATE-COMPARISON.md; language-specific implementation'
    if path.startswith(('tests/', 'test/', 'conftest', 'fixtures/')):
        return 'Template regression/example; equivalent local contracts and product tests'
    if path.startswith(('src/', 'examples/', 'apps/', 'demo/', 'crates/')):
        return 'Template sample product; preserve existing multi-language application'
    if path.endswith(('.md', '.rst')) or path.startswith(('docs/', '.changeset/', 'changelog.d/')):
        return 'Documentation/release fragment; compare policy, do not import template product history'
    if path.startswith(('data/', 'dev/', 'assets/', 'screenshots/')):
        return 'Reference data/assets/history; archived for complete-tree comparison'
    return 'Language/tool/project configuration; reviewed applicability in TEMPLATE-COMPARISON.md'


def ci_role(path):
    """Assign every CI helper/config to an explicit product policy, even without a counterpart."""
    name = Path(path).name.replace('_', '-')
    if path.startswith('.github/workflows/'):
        return {
            'release.yml': 'release.yml: merge/check/status gate, versioning, preflight and serialized publication',
            'security.yml': 'security-audit.yml + release security jobs: dependency/secret/SARIF verdicts',
            'workflows.yml': 'release.yml workflow-lint: bundled actionlint/ShellCheck/pyflakes, zizmor and contracts',
            'links.yml': 'links.yml: valid reports, source-link errors, bounded classified rechecks',
            'docs.yml': 'pages.yml + build-api-docs: multilingual product docs; no Sphinx/PyPI package',
            'desktop-release.yml': 'desktop-release.yml: exact upstream evidence, native artifacts, separate publish gate',
            'example-app.yml': 'Product Pages/desktop/mobile/package/browser jobs cover the actual consumer, not template demos',
            'javascript-first-example.yml': 'Example orchestration: product JS fast checks precede dependent runtime/native builds',
            'javascript-first-gate.yml': 'Reusable example gate: product has terminal required gate and runtime/browser matrix',
        }[name]
    if '/actions/' in path:
        return 'Optional registry-image publication/buildx support; product has container smoke checks but no registry-image publication target'
    if path.startswith('.github/'):
        return 'Product CodeQL/zizmor/workflow policy: exact SARIF verdicts, scoped exceptions, full tool availability'
    if path.startswith('.husky/') or name in ('install-git-hooks.mjs', 'check-staged-formatting.mjs'):
        return 'Root Husky/lint-staged explicitly selects package.json; CI also enforces formatting'
    if path.startswith('scripts/'):
        groups = [
            (r'\.test\.|/tests\.|/fixtures/|test-scripts', 'Template regression/fixture; product ci-*.test.js and isolated release rehearsals enforce equivalent contracts'),
            (r'docker|buildx', 'Container smoke exists; registry-image publisher is not a current product target'),
            (r'javascript-first', 'Example orchestration; actual product fast checks and terminal gate retained'),
            (r'preflight|dependency-graph', 'preflight-release.mjs + dependency-graph.mjs: prove prerequisites before expensive checks, no secret fallback'),
            (r'pipeline-status|status-gate', 'check-pipeline-status.mjs + check-ci-workflows.mjs: every required job verdict gates writes'),
            (r'cancel-in-progress', 'workflow-policy.mjs + ci-writer-policy.test.js: read-only per-lane cancellation, shared non-cancelling writers'),
            (r'simulate-fresh-merge|pr-comparison|detect-code-changes', 'simulate-fresh-merge.sh + detect-code-changes.mjs: actual merge and complete comparison range'),
            (r'push|land-via-pull-request', 'version-and-commit-helpers.mjs + issue-52/rehearse-push.mjs: bounded classified race recovery, no direct source merge'),
            (r'github-release|release-notes', 'create/format-github-release + shared github-release-content/state: exact commit, strict API state, complete bounded notes'),
            (r'publish|wait-for|npm-registry|release-needed|check-release\.', 'publish-to-npm + publish-policy + registry-state: exact version, OIDC, bounded transient retries; no independent crates.io/PyPI product'),
            (r'package-desktop|desktop-release-resolve', 'Product desktop-release gate, native packaging/asset/updater checks; blocked prerequisites remain blocked'),
            (r'smoke-test', 'pack-smoke.mjs and actual installed desktop checks; no sample crate/PyPI publication assumed'),
            (r'changeset|changelog|bump|version|release-index', 'Changesets + version-and-commit + sync-lockfile-version: root metadata-only updates, patch fragment; no sample package identity imported'),
            (r'recheck-broken-links|web-archive', 'links.yml + lychee-report/wayback-state: valid reports and archived-source status do not erase source failure'),
            (r'check-required-docs|check-pages', 'Required multilingual docs, Pages build/artifact checks and both browser lanes already gate product'),
            (r'file-size|file-line|crate-size', 'Product source line limits and package-smoke validation; evidence excluded from source lint but bounded and checksummed'),
            (r'workflow|cargo-warnings|mjs-syntax', 'Workflow-lint bundled tool checks, syntax check, Rust warnings-as-errors including rustdoc'),
            (r'cargo-lock|audit-dependencies', 'Committed Cargo.lock + cargo audit; npm dependency/deprecation policy; Python experiments have no product dependency manifest'),
            (r'package-manager|setup-npm|sanitize-npm|bootstrap-dependencies', 'Exact npm bootstrap and pinned manifests/locks; explicit cache writers and reviewed native-install scripts'),
            (r'paths|read-manifest|package-info|release-naming|release-metadata', 'js-paths/package-info + root package metadata; preserve product tag/package identity rather than language-demo paths'),
            (r'run-command|run-with-budget|debug-print|github-actions-log|use-module|git-config|github-output|install-rust-script', 'Pinned local helper loading, command-process argument safety, bounded job deadlines and opt-in redacted diagnostics; no new Rust-script bootstrap'),
            (r'lint', 'Root ESLint/Prettier/duplicate/secret checks; product changes remain gated regardless of snapshot exclusions'),
            (r'update-preview-images', 'Template screenshot regeneration: no UI change or generated preview needed for this CI repair'),
        ]
        for pattern, role in groups:
            if re.search(pattern, path.replace('_', '-')):
                return role
        raise ValueError(f'Unreviewed CI helper: {path}')
    return 'Root tool/manifest/hooks/config: product pins, lint/format/secrets/install policy retained; language-specific demo publishing configuration not imported'


def main():
    records = []
    comparison = OUT / 'comparison'
    comparison.mkdir(exist_ok=True)
    for folder in sorted((OUT / 'templates').iterdir()):
        tree = json.loads((folder / 'tree.json').read_text())
        source = next((folder / 'source').iterdir())
        rows = []
        diffs = []
        for item in tree['tree']:
            row = dict(template=folder.name, commit=tree['sha'], **item)
            path = item['path']
            if item['type'] != 'blob':
                row['decision'] = 'Directory (complete recursive tree retained)'
                records.append(row)
                continue
            data = (source / path).read_bytes()
            row['sha256'] = hashlib.sha256(data).hexdigest()
            match = counterpart(path)
            row['counterpart'] = match
            row['decision'] = decision(path, match)
            if match:
                local = (ROOT / match).read_bytes()
                row['local_sha256'] = hashlib.sha256(local).hexdigest()
                row['equal'] = data == local
                # Keep whole-file diffs for text, avoid binary/generated noise.
                if b'\0' not in data and b'\0' not in local and max(len(data), len(local)) < 250_000:
                    diffs.extend(difflib.unified_diff(data.decode(errors='replace').splitlines(True),
                                                    local.decode(errors='replace').splitlines(True),
                                                    fromfile=f'{folder.name}/{path}', tofile=match))
            rows.append(row)
            records.append(row)
        (comparison / f'{folder.name}.diff').write_text(''.join(diffs))
        header = f'# Complete file comparison: {folder.name}\n\nCommit: `{tree["sha"]}`. Every blob in the recursive tree is listed.\n\n'
        header += '| Template file | Local file / disposition | Content |\n| --- | --- | --- |\n'
        for row in rows:
            content = 'equal' if row.get('equal') else ('different: full diff archived' if row.get('counterpart') else 'template-specific')
            header += f'| `{row["path"]}` | `{row["counterpart"]}` — {row["decision"]} | {content} |\n' if row.get('counterpart') else f'| `{row["path"]}` | {row["decision"]} | {content} |\n'
        (comparison / f'{folder.name}.md').write_text(header)
        print(folder.name, len(tree['tree']), 'entries;', len(rows), 'files;', Counter(r['decision'] for r in rows))
    (comparison / 'all-template-files.json').write_text(json.dumps(records, indent=2) + '\n')
    roles = '# Complete CI helper, workflow and configuration role map\n\n'
    roles += 'Every selected blob is listed, including paths absent locally. See TEMPLATE-COMPARISON.md for source-level findings and applicability.\n\n'
    roles += '| Template / path | Local counterpart | Policy / decision |\n| --- | --- | --- |\n'
    for row in records:
        path = row['path']
        if row['type'] != 'blob' or not (path.startswith(('.github/', 'scripts/', '.husky/')) or '/' not in path or path == '.changeset/config.json'):
            continue
        row_role = ci_role(path)
        roles += f'| {row["template"]} / `{path}` | {row.get("counterpart") or "role equivalent / applicability below"} | {row_role} |\n'
    (comparison / 'CI-ROLES.md').write_text(roles)
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    (comparison / 'local-tracked-tree.txt').write_text('\n'.join(sorted(filter(None, tracked))) + '\n')


if __name__ == '__main__':
    main()
