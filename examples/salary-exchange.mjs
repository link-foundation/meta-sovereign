// Explicit primary-source refresh, durable-cache semantics and offline fallback.
// No account credentials, provider messages or tax jurisdiction defaults.
// Run: node examples/salary-exchange.mjs (contacts the public Bank of Russia feed).
import { createMemoryStore } from '../js/src/storage/universal.js';
import { salaryExchange } from '../js/src/automation/salary-exchange.js';

const store = createMemoryStore();
const updated = await salaryExchange(store, { refresh: true });
console.log(updated);
const recovered = await salaryExchange(
  store,
  { refresh: true },
  {
    fetchImpl: async () => {
      throw new Error('example offline');
    },
  }
);
console.log({
  status: recovered.status,
  warning: recovered.warning,
  date: recovered.exchange?.asOf,
  unchanged:
    JSON.stringify(updated.exchange) === JSON.stringify(recovered.exchange),
});
