import {
  seedVkGreetings,
  greetingPhrases,
} from './vk-greeting-catalog-fixture.mjs';
import {
  planFromStore,
  loadGreetingSelection,
} from '../../js/src/greetings/plan.js';
import { createGreetingCommands } from '../../js/src/cli/greetings-commands.js';
const store = await seedVkGreetings();
const cli = createGreetingCommands({ openStore: async () => store });
const code = await cli['greetings-select'](
  { texts: greetingPhrases.join('\n'), json: true },
  () => {}
);
const selection = await loadGreetingSelection(store);
const plan = await planFromStore(store, { mode: 'reply', random: () => 0 });
console.log(
  JSON.stringify(
    {
      code,
      texts: selection.texts.en,
      envelopes: plan.envelopes.map(({ chat, skipped, text }) => ({
        chat,
        skipped,
        text,
      })),
    },
    null,
    2
  )
);
