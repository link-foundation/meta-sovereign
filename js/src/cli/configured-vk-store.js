import { startupArguments } from './startup-configuration.js';
import { configureAutomationSettings } from '../automation/configured-settings.js';
import { defaultStoreDir } from '../storage/app-directory.js';

/** Validate before opening a writer; status remains read-only. */
export const openConfiguredVkStore = async (open, args, configuration) => {
  const { automationDefaults } = await startupArguments(args, configuration);
  const store = await open(args.store ?? defaultStoreDir());
  return configureAutomationSettings(store, automationDefaults);
};
