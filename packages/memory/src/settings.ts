import { z } from 'zod';

export const MemorySettingsSchema = z.object({
  info_maps: z.record(z.unknown()).default({}),
});

export type MemorySettings = z.infer<typeof MemorySettingsSchema>;

export function createDefaultSettings(): MemorySettings {
  return { info_maps: {} };
}
