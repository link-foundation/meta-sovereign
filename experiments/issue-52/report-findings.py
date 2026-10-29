"""Render a complete resolution table from the preserved main CodeQL alerts."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'dev/log/issues/52/pulls/53'


def resolution(alert):
    number = alert['number']
    if number == 2:
        return 'Audited intentional regex API; exact constructor line and complete source SHA256; caps and existing server VM timeout retained.'
    if number == 35:
        return 'Audited deliberate adversarial timeout regression; exact assertion and complete source SHA256. Fixed 5001-character input runs through safeTest and its 50 ms server VM budget.'
    if number == 52:
        return 'Anchored WhatsApp prefix/delimiter scan replaces overlapping whitespace captures.'
    if number in [51, 50, 49, 48, 5]:
        return 'htmlparser2 token/DOM parsing replaces HTML matching/removal; existing VK archive fixtures preserved.'
    if number == 47:
        return 'Split address candidates before anchored extraction; no unbounded unanchored address search.'
    if number in [45, 44, 43]:
        return 'Split charset parameter at its first star instead of searching with a repeated unanchored regex.'
    if number == 46:
        return 'Explicit trailing-slash index scan replaces repeated regex suffix search.'
    if number == 42:
        return 'Find the first equals delimiter, validate key and preserve quoted credentials without overlapping regex groups.'
    if number == 41:
        return 'Explicit metadata closing delimiter and colon checks replace overlapping captures.'
    if number in [40, 39]:
        return 'Shared streaming markup parser replaces tag/attribute regex tokenization; existing decoding/consumer contracts retained.'
    if number in [38, 37, 36]:
        return 'Telemetry uses bounded token/address checks, delimiter scans and parser node counting.'
    if number in [34, 33, 32, 31, 30, 29, 28]:
        return 'Sticky word-token iteration and anchored suffix checks replace exponential greeting regex; all five language patterns and existing fixtures retained.'
    if number in [27, 26, 25, 24, 20, 18]:
        return 'Test assertion now compares parsed URL origin/hostname; source was test verification, not a production navigation vulnerability.'
    if number in [23, 22, 21, 19, 17]:
        return 'Test assertion now compares exact text tokens or array members; source was a weak test assertion. CI caught/corrected the initial array/string mix-up for #22.'
    if number == 15:
        return 'Experiment subprocesses use execFileSync(process.execPath, argument arrays), preserving literal environment arguments without shell interpolation.'
    if number == 14:
        return 'Shared redact safeMessage no longer stringifies arbitrary error objects that can expose a stack; util response callers inherit the fix.'
    if number in [13, 12, 11]:
        return 'CV canonical field allowlists, null-prototype maps and defined own properties reject prototype/unknown paths; valid plan/diff/application fixtures remain.'
    if number == 10:
        return 'Capture formatter kind, require Object.hasOwn, then invoke the validated own entry.'
    if number == 9:
        return 'Test uses explicit script delimiters rather than regex-based tag removal.'
    if number == 8:
        return 'Email HTML stripping uses streaming parser with blocked-content depth, including the budget-overflow path.'
    if number == 7:
        return 'Fixture tag insertion uses explicit delimiter slicing, so rewritten bytes cannot synthesize another matched tag.'
    if number == 4:
        return 'Restricted SVG XML token allowlist and canonical serialization replace regex sanitizer; reject active/external/CSS-escaped resources; wallpaper fixtures remain.'
    if number == 3:
        return 'CV page text extraction uses streaming parser callbacks and existing newline/entity conventions.'
    if number == 1:
        return 'Locale-key experiment compiles/tests input through the existing capped safe-regex API.'
    raise ValueError(number)


if __name__ == '__main__':
    alerts = json.loads((OUT / 'research/codeql-alert-inventory.json').read_text())
    assert len(alerts) == 50
    text = '''# Every original CodeQL finding

Source: full main JavaScript SARIF and paginated alert API snapshot at
`dc30f00aefb2c1a89c64bf7e7fa78ef80a860fe7`. Alert numbers are repository alert IDs;
missing numbers in the sequence were not open in this snapshot. There are exactly
50 results, not 50 distinct root causes. Both scheduled/release workflows used
the same source. Findings in test assertions are distinguished from production
security flaws; test-strengthening still removes the ambiguous assertion.

The verdict gate rejects the unmodified main SARIF and every unreviewed result.
Two intentional regex behaviors have narrowly pinned reviews, not disabled
queries or severity filters. Any change to an audited file invalidates its
exception until reviewed again. See `.github/codeql/audited-findings.json` and
`js/tests/ci-codeql-results.test.js` for malformed/missing/multiple-run/severity
and stale-digest regressions. Existing consuming feature tests remain required.

| Alert | Rule | Original location | Root-cause repair / disposition |
| ---: | --- | --- | --- |
'''
    for alert in alerts:
        location = alert['most_recent_instance']['location']
        text += (f"| [#{alert['number']}]({alert['html_url']}) | `{alert['rule']['id']}` | "
                 f"`{location['path']}:{location['start_line']}` | {resolution(alert)} |\n")
    (OUT / 'CODEQL-FINDINGS.md').write_text(text)
