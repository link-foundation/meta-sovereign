"""Wrap the actual published opener statement for a finite native layout probe."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'bea3183ee94d04d0cb51b3961b0db08d84ef01c7'
source = subprocess.check_output([
    'git', 'show', f'{parent}:js/tests/e2e-follow-telegram-backlinks-browser.mjs'
], cwd=root, text=True)
statement = next(line.strip() for line in source.splitlines()
                 if "await card.locator('summary').click();" in line)
path = root / 'js/tests/helpers/follow-disclosure.mjs'
saved = path.read_bytes()
try:
    path.write_text('export const openFollowDisclosure = async (card) => {\n  '
                    + statement + '\n};\n')
    log = root / 'ci-logs/ci-follow-layout-before.log'
    with log.open('wb') as output:
        result = subprocess.run([
            'node', '--max-old-space-size=384',
            'experiments/issue-56/follow-layout-browser.mjs'
        ], cwd=root, stdout=output, stderr=subprocess.STDOUT, check=False)
    assert result.returncode != 0
    assert 'element is not visible' in log.read_text()
    print('Published native opener fails after injected coordinate movement.')
finally:
    path.write_bytes(saved)
