import {
  listVkAttachments,
  saveVkAttachmentSettings,
} from '../sources/vk-attachment-metadata.js';
import { activeAccount } from './telegram-account-scope.js';

export const createVkAttachmentsApi = ({ get, report, local }) => ({
  async vkAttachments(after = '') {
    const account = activeAccount();
    const answer = await get(
      `/api/vk/attachments?after=${encodeURIComponent(after)}`
    );
    return (
      answer ??
      (account === 1 && activeAccount() === 1
        ? listVkAttachments(await local(), { after })
        : { ok: false, error: 'server required' })
    );
  },
  async saveVkAttachmentCollection(enabled) {
    const account = activeAccount();
    const answer = await report(
      '/api/vk/attachments',
      { enabled },
      { network: true }
    );
    return (
      answer ??
      (account === 1 && activeAccount() === 1
        ? saveVkAttachmentSettings(await local(), { enabled })
        : { ok: false, error: 'server required' })
    );
  },
});
