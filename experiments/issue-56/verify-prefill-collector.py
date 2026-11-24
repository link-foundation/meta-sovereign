"""Check collector admission using retained real successful and missing evidence."""
import ast
from pathlib import Path
from hosted_evidence import (
    browser_group_block, read_literal_tests, read_detached_learning,
)

root = Path(__file__).resolve().parents[2]
source = lambda name: (root / name).read_text()
logs = root / 'ci-logs'
tree = ast.parse(source('experiments/issue-56/collect-form-prefill-hosted.py'))
templates = next(ast.literal_eval(node.value) for node in tree.body
    if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name)
        and target.id == 'transport_templates' for target in node.targets))
expanded = {stem: {template: [template.replace('${media}', media)
    for media in ['text/lino', 'application/lino-binary']]}
    for stem, template in templates.items()}
model_lines = (logs / 'forms-private-model-focused.log').read_text().splitlines()
model = read_literal_tests(['forms-private-model', 'forms-model-review',
    'answer-model-drafts', 'forms-private-profile'], source, model_lines,
    parameterized=expanded)
assert sum(map(len, model.values())) == 30
try:
    read_literal_tests(['forms-private-model'], source,
        [line for line in model_lines if 'application/lino-binary' not in line],
        parameterized=expanded)
except AssertionError:
    pass
else:
    raise AssertionError('a missing binary transport check was accepted')
reader = read_literal_tests(['forms-reader', 'forms-report'], source,
    (logs / 'hosted-5283e26a-node.log').read_text().splitlines())
assert sum(map(len, reader.values())) == 18
start, end, _ = browser_group_block(
    (logs / 'hosted-5283e26a-chromium-4.log').read_text().splitlines(), 'forms-reader')
receipt = read_detached_learning((logs / 'ci-forms-watchers-browser.log').read_text())
assert receipt['unchangedEditMs'] >= 60_000
print(dict(modelTests=30, missingBinaryRefused=True, readerTests=18,
    hostedReaderLines=[start, end], nativeUnchangedMs=receipt['unchangedEditMs'],
    fullHostedAcceptance=False))
