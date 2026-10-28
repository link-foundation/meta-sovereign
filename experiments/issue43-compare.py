"""Inventory pinned template trees and compare every collected CI/config file.

Does not import or execute downloaded source. Re-run after changing local CI to
refresh file hashes, structural observations and unified comparisons.
"""

import difflib
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dev/log/issues/43/pulls/44'

ALIASES = {
    'check-pipeline-status.sh': 'check-pipeline-status.mjs',
    'check-status-gate-covers-all-jobs.mjs': 'check-ci-workflows.mjs',
    'check-workflow-tools.rs': 'check-ci-workflows.mjs',
    'check-dependency-graph.sh': 'dependency-graph.mjs',
    'check_release.py': 'check-release-needed.mjs',
    'check-release-needed.rs': 'check-release-needed.mjs',
    'detect_code_changes.py': 'detect-code-changes.mjs',
    'detect-code-changes.rs': 'detect-code-changes.mjs',
    'check_file_size.py': 'check-file-line-limits.sh',
    'check-file-size.rs': 'check-file-line-limits.sh',
    'check_web_archive.py': 'check-web-archive.mjs',
    'github-release-state.mjs': 'github-release-state.mjs',
    'release-metadata.mjs': 'validated-release-tree.mjs',
    'preflight-credentials.sh': 'preflight-release.mjs',
    'npm-registry.mjs': 'registry-state.mjs',
    'smoke-test-package.mjs': '../tests/pack-smoke.mjs',
    'smoke_test_published_package.py': '../tests/pack-smoke.mjs',
    'create_github_release.py': 'create-github-release.mjs',
    'create-github-release.rs': 'create-github-release.mjs',
    'version_and_commit.py': 'version-and-commit.mjs',
    'version-and-commit.rs': 'version-and-commit.mjs',
    'validate_changeset.py': 'validate-changeset.mjs',
    'check-changelog-fragment.rs': 'validate-changeset.mjs',
    'format_release_notes.py': 'format-release-notes.mjs',
    'create_manual_changeset.py': 'create-manual-changeset.mjs',
    'bump_version.py': 'instant-version-bump.mjs',
    'bump-version.rs': 'instant-version-bump.mjs',
}


def disposition(name):
    """Explicit product boundaries, rather than importing template products."""
    if name.startswith(('tests/', 'test/')):
        return ('template regression coverage', 'Retain as read-only test design reference. Product regressions use ci-detection, ci-helpers, ci-contracts, ci-release-tree and wayback-state tests, with temporary Git fixtures and injected API responses. Do not execute or transplant template package/demo fixtures.')
    if any(s in name for s in ('docker', 'buildx')):
        return ('container infrastructure', 'No container registry is published by this project. Keep the product Dockerfile; do not add registry credentials, cross-architecture emulation or a new release channel. Any future image publisher must use native runners per architecture (principle 13).')
    if any(s in name for s in ('javascript-first', 'example-app', 'update-preview-images')):
        return ('template demonstration', 'Template example app and template-specific preview automation are not product requirements. Equivalent real application coverage is the retained Node/Bun/Deno matrix, Pages checks and both browser engines.')
    if any(s in name for s in ('crates-publish', 'publish-crate', 'wait-for-crate', 'smoke-test-published-crate', 'crates-io', 'release-index', 'crate-size', 'get-bump-type', 'collect-changelog', 'changelog-files', 'get-version.rs', 'git-config.rs', 'github-output.rs', 'release-naming.rs', 'rust-paths', 'install-rust-script', 'test-scripts', 'check-cargo-lock', 'check-version-modification')):
        return ('Rust package publishing', 'All three Rust crates intentionally have publish=false (PR 40); retain fmt/clippy/tests/doc/audit coverage without introducing crates.io publishing, crate release tags or Rust-script installation.')
    if any(s in name for s in ('publish_to_pypi', 'read_manifest', 'audit_dependencies', 'pyproject.toml', '.ruff.toml')):
        return ('Python package publishing', 'Python is repository tooling, with no shipped Python package or third-party Python runtime requirements. Do not add PyPI publishing. Compile/lint the maintained tools and scan Python source with CodeQL; npm/Cargo locks cover shipped dependencies.')
    if any(s in name for s in ('land-via-pull-request', 'push-failure', 'push-main-with-rebase')):
        return ('release landing policy', 'Retain the existing version commit release channel and forward-only history. Reject source drift and policy refusals; do not rebase unvalidated source or bypass protected branches. Metadata-only tree guard and explicit git authentication cover this product path.')
    if any(s in name for s in ('read-job-cancel', 'run-with-budget')):
        return ('deadline and cancellation handling', 'Use finite per-test/per-browser budgets, nonzero deadline results and a terminal gate; runner job timeouts are backstops. Superseded job cancellation is isolated from non-cancellable release writes. Review actual timeout evidence before importing the template process supervisor.')
    if any(s in name for s in ('recheck', 'web-archive', 'lychee')):
        return ('link classification', 'Keep HTTP failures separate from successful redirects; fail on missing reports and non-HTTP failures; an archived copy is a repair suggestion. Exact documented bot challenge exclusions cover verified false positives. Retain the source-link failure gate and upload evidence.')
    if 'security' in name or 'codeql' in name or 'dependency-graph' in name:
        return ('security coverage', 'Apply CodeQL for JS/Python/Rust/Actions, scheduled committed-lock audits, dependency review capability preflight, and explicit administrator guidance on main. Unknown API failures are errors; PRs can report unavailable credentials without publishing.')
    if 'workflows.yml' in name or 'workflow' in name or 'zizmor' in name:
        return ('workflow policy', 'Apply bundled actionlint/ShellCheck/pyflakes, standalone shell checks, pinned zizmor and runner/action policy, terminal gate coverage, least privilege and environment-based expression handling. Keep the checks inside the publishing gate.')
    if any(s in name for s in ('use-module', 'debug-print', 'bootstrap', 'package-manager', 'run-command', 'github-actions-log')):
        return ('runtime and helper loading', 'Use lockfile-installed command-stream/lino-arguments, normalize ESM/CommonJS exports, enforce nonzero command failures, and keep opt-in diagnostics off by default. Preserve the existing independent runtime matrix; never fetch/eval an unpinned helper.')
    if name.endswith(('package-lock.json', 'package.json', 'Cargo.toml', 'deno.json', 'bunfig.toml')):
        return ('dependency and runtime configuration', 'Retain product manifests and lockfiles; adopt exact CI-tool versions, maintained Telegram client, fixed KaTeX, explicit script approvals and explicit Deno package resolution. Product engines and optional integrations remain supported; template package identities/versions are not copied.')
    if name.startswith(('.husky/', '.pre-commit', '.prettier', '.jscpd', '.secret')) or 'format' in name or 'lint' in name:
        return ('code quality', 'Retain formatting, ESLint, duplication and secret gates with pre-commit hooks. Ignore immutable collected reference evidence, not maintained source. Check tracked files recursively and keep all warnings visible.')
    if name.startswith('scripts/'):
        return ('CI/release helper', 'Compare the concrete helper below with the local counterpart. Preserve merge-result validation, changesets, registry truth, GitHub recovery, safe command execution and actionable failures; retain product-specific multi-language paths and desktop integration.')
    if name.startswith('.github/workflows/'):
        return ('product workflow', 'Retain product workflow features and triggers; apply least privilege, relevant whole-range detection, fast gates before expensive work, supported runners, explicit deadlines, reliable status aggregation and durable diagnostics.')
    return ('configuration', 'Retain product configuration; use the template as a policy reference rather than replacing product-specific values.')


def counterpart(name):
    path = ROOT / name
    if path.is_file():
        return path
    if name.startswith('scripts/'):
        path = ROOT / 'js/scripts' / ALIASES.get(Path(name).name, Path(name).name)
        if path.is_file():
            return path
    if name.startswith(('tests/', 'test/')):
        if 'detect' in name:
            return ROOT / 'js/tests/ci-detection.test.js'
        if any(key in name for key in ('publish', 'release', 'registry', 'credentials', 'dependency_graph')):
            return ROOT / 'js/tests/ci-helpers.test.js'
        if any(key in name for key in ('workflow', 'check_', 'pipeline', 'archive', 'ci-cd/')):
            return ROOT / 'js/tests/ci-contracts.test.js'
    if name == 'Cargo.toml':
        return ROOT / 'rust/Cargo.toml'
    if name == 'Cargo.lock':
        return ROOT / 'rust/Cargo.lock'
    if name.endswith('/docs.yml'):
        return ROOT / '.github/workflows/pages.yml'
    if name == 'eslint.config.js':
        return ROOT / 'js/eslint.config.js'
    if name.endswith('/workflows.yml'):
        return ROOT / '.github/workflows/release.yml'
    return None


def main():
    comparison = DEST / 'comparison'
    comparison.mkdir(exist_ok=True)
    rows = []
    for language in ('js', 'rust', 'python'):
        directory = DEST / 'templates' / language
        sha = json.loads((directory / 'revision.json').read_text())['sha']
        tree = json.loads((directory / 'tree.json').read_text())
        assert not tree.get('truncated')
        complete = []
        for entry in tree['tree']:
            item = dict(entry)
            item['review_scope'] = ('CI/config source preserved and compared' if (directory / 'files' / entry['path']).is_file() else 'Full-tree context; see coverage review for excluded application/demo/documentation')
            complete.append(item)
        (comparison / f'{language}-full-tree.json').write_text(json.dumps(complete, indent=2) + '\n')
        for file in sorted((directory / 'files').rglob('*')):
            if not file.is_file():
                continue
            name = str(file.relative_to(directory / 'files'))
            text = file.read_text()
            local = counterpart(name)
            category, decision = disposition(name)
            row = {
                'template': language, 'revision': sha, 'path': name,
                'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                'lines': len(text.splitlines()), 'category': category,
                'decision': decision,
                'local_counterpart': str(local.relative_to(ROOT)) if local else None,
                'functions': re.findall(r'^\s*(?:export )?(?:async )?(?:function|def|fn|pub fn)\s+(\w+)', text, re.M),
                'environment': sorted(set(re.findall(r'(?:process\.env\.|\$\{)([A-Z][A-Z_\d]+)', text))),
            }
            if local:
                current = local.read_text()
                row['local_sha256'] = hashlib.sha256(local.read_bytes()).hexdigest()
                row['identical'] = current == text
                # Full sources and hashes are retained for locks; a lock diff
                # across unrelated packages is noise, not semantic review.
                if not name.endswith(('lock.json', '.lock')):
                    diff = ''.join(difflib.unified_diff(text.splitlines(True), current.splitlines(True), fromfile=f'{language}@{sha}/{name}', tofile=str(local.relative_to(ROOT))))
                    target = comparison / language / f'{name}.diff'
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(diff)
                    row['diff'] = str(target.relative_to(DEST))
            rows.append(row)
    (comparison / 'file-inventory.json').write_text(json.dumps(rows, indent=2) + '\n')
    out = ['# Complete template CI/config comparison', '', 'Generated by `experiments/issue43-compare.py`. Immutable sources and complete non-truncated trees are retained under `templates/`. Each CI/config file is inventoried, hashed, classified and mapped; mapped text has a unified diff. This inventory records scope and dispositions; the investigation report records causal findings and test evidence.', '', '| Template | File | Lines | Category | Local comparison |', '| --- | --- | ---: | --- | --- |']
    for row in rows:
        local = row['local_counterpart'] or 'See category decision in file-inventory.json'
        out.append(f"| {row['template']} | `{row['path']}` | {row['lines']} | {row['category']} | `{local}` |")
    (comparison / 'README.md').write_text('\n'.join(out) + '\n')
    print(f'Compared {len(rows)} CI/config files across three complete template trees')


if __name__ == '__main__':
    main()
