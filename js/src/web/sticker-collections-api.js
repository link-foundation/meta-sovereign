import {
  loadStickerCollections,
  saveStickerCollections,
} from '../greetings/collections.js';
import { activeAccount } from './telegram-account-scope.js';
export const createStickerCollectionsApi = ({ get, report, local }) => ({
  async stickerCollections() {
    const account = activeAccount();
    const answer = await get('/api/sticker-collections');
    if (answer) {
      return answer;
    }
    return account === 1 && activeAccount() === 1
      ? loadStickerCollections(await local())
      : { ok: false, error: 'server required' };
  },
  async saveStickerCollections(collections) {
    const account = activeAccount();
    const answer = await report('/api/sticker-collections', { collections });
    if (answer) {
      return answer;
    }
    return account === 1 && activeAccount() === 1
      ? saveStickerCollections(await local(), collections)
      : { ok: false, error: 'server required' };
  },
});
