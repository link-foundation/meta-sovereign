import { createHhLive } from '../../js/src/sources/hh.js';
import { pullLiveInto } from '../../js/src/sources/index.js';
import { hhCommonFixture } from './hh-common-fixture.mjs';
import { vacancyId } from './assignment-vacancy-fixture.mjs';

export const importAssignmentChat = async (store, formUrl) => {
  const fixture = hhCommonFixture();
  fixture.chats.get('41')[0].payload.text = `Please complete ${formUrl}`;
  fixture.state.transform = (value) =>
    value.messages && value.id === '41'
      ? { ...value, vacancy_id: vacancyId }
      : value;
  return pullLiveInto(store, 'hh', {
    live: createHhLive({ ...fixture, token: 'fixture-token' }),
  });
};
