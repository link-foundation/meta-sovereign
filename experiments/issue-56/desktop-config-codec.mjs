import { formatIndented, parseIndented } from 'lino-objects-codec';
const value = {
  server: { port: 8787, verbose: false },
  vk: { priority: ['42'], messages: [] },
};
const text = formatIndented({ id: 'configuration', obj: value });
console.log(text);
for (const notation of [
  text,
  'configuration:\n  server:\n    port 8788\n',
  'configuration:\n  broken (\n',
  'private invalid value',
  'configuration:\n  __proto__ bad\n',
]) {
  try {
    console.log(JSON.stringify(parseIndented({ text: notation })));
  } catch (error) {
    console.log(error.name);
  }
}
