"""Compare complete immutable template trees, retaining every file decision."""

from collections import Counter
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'dev/log/issues/52/pulls/53'


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
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    (comparison / 'local-tracked-tree.txt').write_text('\n'.join(sorted(filter(None, tracked))) + '\n')


if __name__ == '__main__':
    main()
