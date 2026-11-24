// Four finite, synthetic inputs; no owner contact files or parser stress.
import { Parser, Link } from 'links-notation';
for (const value of [
  '@example_owner',
  'Owner "alias"',
  "Owner's alias",
  'One\nsecond line',
]) {
  const cst = new Parser({ maxInputSize: 64000, maxDepth: 4 }).parseCst(
    `summary\n  ${Link.escapeReference(value)}\n`
  );
  console.log(
    JSON.stringify(
      cst
        .tokens()
        .filter((t) => t.kind === 'reference')
        .map((t) => ({ value: t.value, quote: t.quote }))
    )
  );
}
