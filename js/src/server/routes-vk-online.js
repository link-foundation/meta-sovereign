import { loadVkOnline, saveVkOnline } from '../automation/vk-online.js';
import { createVkJobRoute } from './routes-vk-job.js';

export const handleVkOnline = createVkJobRoute({
  path: '/api/vk/online',
  load: loadVkOnline,
  save: saveVkOnline,
  actions: { run: (ctx) => ctx.vkOnline.run() },
});
