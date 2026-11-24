import { createVkSequenceJob } from './vk-sequence-job.js';
import { vkReengageSettings } from './vk-reengage-settings.js';

export const createVkReengageJob = ({ kind, ...options }) => {
  const policy = vkReengageSettings[kind];
  if (!policy) {
    throw new Error('VK topic, help or music policy required');
  }
  return createVkSequenceJob({ kind, policy, ...options });
};
