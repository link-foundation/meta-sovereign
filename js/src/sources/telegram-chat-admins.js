/**
 * Adding members and managing administrators (R-Y204; learned, never
 * copied): the actions of telegram-add-members.js (`addCandidates`,
 * `addMembers`, `sendInviteLink`) and telegram-admin-manage.js
 * (`chatAdmins`, `setAdmin`, `setHistoryHidden`, `upgradeGroup`), sharing
 * the users they have seen (their access hashes).
 */

import { createAddMembersActions } from './telegram-add-members.js';
import { createAdminManage } from './telegram-admin-manage.js';

export const createChatAdmins = (env, context) => {
  const known = new Map();
  return {
    ...createAddMembersActions(env, context, known),
    ...createAdminManage(env, context, known),
  };
};
