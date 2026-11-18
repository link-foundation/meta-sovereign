"""Retain an unresolved hosted failure and finite passing diagnostic replay."""
import json
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'profile-navigation')
assert '[e2e-resume-profile-navigation] OK (webkit)' in read('webkit-final')
assert 'pass 4' in read('contracts')
assert 'All workflows enforce' in read('workflows')
assert not read('lint').strip()
assert not read('secrets').strip()
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'ERROR' not in read('duplication')
states = [json.loads(line.split('[profile-navigation] ')[1])
          for line in read('webkit-final').splitlines()
          if line.startswith('[profile-navigation] ')]
assert [row['phase'] for row in states] == [
    'before-navigation', 'after-navigation', 'root-state', 'root-click',
    'preview-state', 'preview-click']
assert len(set(row['document'] for row in states)) == 2
assert states[-1]['root']['open'] is True
sources = [
    '.github/workflows/release.yml',
    'js/tests/helpers/e2e-resume-profile.mjs',
    'js/tests/helpers/e2e-profile-navigation-trace.mjs',
    'experiments/issue-56/resume-profile-navigation.mjs',
    'experiments/issue-56/collect-profile-navigation.py',
    'docs/case-studies/issue-56/ci-profile-navigation.md',
    *evidence_logs(root, 'profile-navigation'),
    'ci-logs/resume-profile-navigation-sequence.log',
    'ci-logs/resume-profile-navigation-sequence-seeded.log',
    *[str(path.relative_to(root)) for path in (root / 'ci-logs').glob(
        'resume-export-preceding-*') if path.is_file()
        and path.suffix in ('.log', '.json', '.png', '.tsv')],
    *[str(path.relative_to(root)) for path in (root / 'docs/screenshots').glob(
        'issue-56-profile-navigation/*.png')],
]
bundle(root, sources,
       'docs/case-studies/issue-56/data/ci-profile-navigation.tar.gz',
       dict(parent='9e2169f31b843d06b877601d1c882f64dd51288f',
            hosted=dict(commit='3a6a49fdf06f20669972653d43db78945183c516',
                        run=43162679447, job=130998380216,
                        created='2026-11-12T05:38:01Z', lines=[838, 861]),
            local_profile_helpers=4, contracts=4, diagnostic_phases=6,
            root_cause='unproven', behavior_changed=False,
            unfinished='Hosted failure, exact-head CI and all unchecked issue criteria'),
       'issue-56-profile-navigation/*.png')
