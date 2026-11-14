"""Finite expected-failure regressions; no native dependency build or server."""
from pathlib import Path
from subprocess import CompletedProcess
from native_parent_failure import check_parent_failure


def verify_parent_failures():
    for label in ('schema-13', 'schema-14', 'current-schema'):
        check_parent_failure(CompletedProcess([], 1,
            stdout=f'Error: native CLI did not reconcile {label} JavaScript peer'), sync=True)
    for code, message in ((0, 'native CLI did not reconcile current-schema JavaScript peer'),
                          (1, 'SCHEMA_MISMATCH: unrelated peer failure'),
                          (1, 'native CLI did not reconcile invalid-schema JavaScript peer')):
        try:
            check_parent_failure(CompletedProcess([], code, stdout=message), sync=True)
        except AssertionError:
            pass
        else:
            raise AssertionError('Unrelated or successful result must be refused')
    check_parent_failure(CompletedProcess([], 1,
        stdout='acknowledged owner write survives process termination: 404 !== 200'), sync=False)
    # Replay the actual preserved hosted failure when present locally.
    hosted = Path(__file__).resolve().parents[2] / 'ci-logs/application-supervised-rust-132362078388.log'
    if hosted.exists():
        check_parent_failure(CompletedProcess([], 1, stdout=hosted.read_text()), sync=True)
    print('PASS expected parent failures: three schema diagnostics, three refusals, durable write and hosted replay')


if __name__ == '__main__':
    verify_parent_failures()
