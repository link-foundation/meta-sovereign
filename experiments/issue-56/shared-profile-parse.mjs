// Finite synthetic probes: inspect the upstream parser's legacy contact shape.
import { Parser } from 'links-notation';

const parser = new Parser({ maxInputSize: 64000, maxDepth: 8 });
for (const input of [
  'telegram\n  "@example_owner"\n',
  'github\n  "github.com/example"\n  "github.com/example-org"\n',
  'summary\n  "Owner \\"alias with spaces\\" example"\n',
  'linkedin\n  https://www.linkedin.com/in/example\n',
]) {
  try {
    console.log(JSON.stringify({ input, parsed: parser.parse(input) }));
  } catch (error) {
    console.log(JSON.stringify({ input, error: error.message }));
  }
}
