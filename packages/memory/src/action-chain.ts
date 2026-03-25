import { z } from 'zod';

export const ActionChainStepStatusSchema = z.enum(['not-started', 'in-progress', 'completed']);
export type ActionChainStepStatus = z.infer<typeof ActionChainStepStatusSchema>;

export const ActionChainStepSchema = z.object({
  name: z.string(),
  key: z.string().nullable().default(null),
  status: ActionChainStepStatusSchema,
  data: z.unknown().nullable().default(null),
});
export type ActionChainStep = z.infer<typeof ActionChainStepSchema>;

export const ActionChainEpisodeSchema = z.object({
  create_time: z.date().default(() => new Date()),
  value: z.array(ActionChainStepSchema).default([]),
});
export type ActionChainEpisode = z.infer<typeof ActionChainEpisodeSchema>;

export const MemoryActionChainSchema = z.object({
  episodes: z.array(ActionChainEpisodeSchema).default([]),
  attributes: z.record(z.unknown()).default({}),
});
export type MemoryActionChain = z.infer<typeof MemoryActionChainSchema>;

export function createDefaultActionChain(): MemoryActionChain {
  return { episodes: [], attributes: {} };
}
