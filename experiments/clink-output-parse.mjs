// How links-notation's Parser sees link-cli query replies.
import { Parser } from 'links-notation';
const text =
  "((привет: привет привет)) ((привет: привет привет))\n((3: привет 'как дела?')) ((3: привет 'как дела?'))\n() ((5: привет 'ms:n:1'))\n(error: \"Query error: x\")\n";
const out = new Parser().parse(text);
const show = (l) =>
  l.values ? { id: l.id, values: l.values.map(show) } : (l.id ?? l);
console.log(JSON.stringify(out.map(show), null, 1));
