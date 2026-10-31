import { scanLinks } from './store-scan.js';
import { collectSelfIds } from '../crm/reengage.js';
import {
  createPeopleAggregation,
  personKey,
  toAudienceSpec,
} from '../crm/people.js';
import { evalAudience } from '../crm/audience.js';

const isMessage = (link) => link.id?.startsWith('msg:');
const projection = (link) => ({
  id: link.id,
  source: link.source,
  chat: link.chat,
  chatType: link.chatType,
  chatName: link.chatName,
  sender: link.sender,
  senderName: link.senderName,
  timestamp: link.timestamp,
  body: link.body,
  facts: link.facts,
});
const queriesIn = (input, queries) => {
  const spec = toAudienceSpec(input);
  if (spec.kind === 'query') {
    queries.set(spec.q, new Set());
  }
  for (const child of spec.of ?? []) {
    queriesIn(child, queries);
  }
};

export const scanPeople = async (
  store,
  { self = [], spec, replacement } = {}
) => {
  const saved = await store.query((link) =>
    /^(person|member|list|audience):/.test(link.id)
  );
  const links = replacement
    ? [...saved.filter((link) => link.id !== replacement.id), replacement]
    : saved;
  const queryMatches = new Map();
  if (spec) {
    queriesIn(spec, queryMatches);
    for (const link of links.filter((link) =>
      link.id.startsWith('audience:')
    )) {
      queriesIn(link.spec ?? link.text, queryMatches);
    }
  }
  const collector = collectSelfIds(self);
  await scanLinks(
    store,
    isMessage,
    (batch) => batch.forEach(collector.add),
    (link) => ({ source: link.source, chat: link.chat, sender: link.sender })
  );
  const selfIds = collector.finish();
  const aggregation = createPeopleAggregation(selfIds);
  await scanLinks(
    store,
    isMessage,
    (batch) => {
      batch.forEach(aggregation.add);
      for (const [query, keys] of queryMatches) {
        for (const link of evalAudience(batch, query)) {
          if (link.source && link.sender && !selfIds.has(String(link.sender))) {
            keys.add(personKey(link.source, link.sender));
          }
        }
      }
    },
    projection
  );
  links.forEach(aggregation.add);
  return { index: aggregation.finish(), links, queryMatches };
};
