import { z } from 'zod';

// ─── MCP Client Server Config ───

export const mcpToolOverrideSchema = z.object({
  isSpecialized: z.boolean().optional(),
  intentHints: z.array(z.string()).optional(),
});
export type McpToolOverride = z.infer<typeof mcpToolOverrideSchema>;

export const mcpServerConfigSchema = z.object({
  name: z.string(),
  transport: z.enum(['stdio', 'sse', 'streamable-http']).default('stdio'),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  env: z.record(z.string()).optional(),
  toolOverrides: z.record(mcpToolOverrideSchema).optional(),
});
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;

// ─── Engine Config Schema ───

export const engineConfigSchema = z.object({
  max_event_loops: z.number().default(30),
  post_msg_verbose: z.boolean().default(false),
  base_llm_provider: z.string().default('openai'),
  base_llm_model: z.string().default('gpt-4o-mini'),
  react_agent: z.object({
    intent_mode: z.enum(['single-rewritten', 'multi-turns']).default('multi-turns'),
    max_rounds: z.number().default(5),
    retrieval_threshold: z.number().default(0.64),
  }),
  memory: z.object({
    settings_expire_seconds: z.number().default(259200),
    actionchain_expire_seconds: z.number().default(300),
    graph_max_sessions: z.number().default(3),
    graph_nodes_max_tokens: z.number().default(6000),
  }),
  logging: z.object({
    app_log_path: z.string().default('./logs/app.log'),
    base_log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  developers: z.array(z.string()).default([]),
  administrators: z.array(z.string()).default([]),
  mcp_client: z.object({
    enabled: z.boolean().default(false),
    servers: z.array(mcpServerConfigSchema).default([]),
  }).default({}),
});

export type EngineConfig = z.infer<typeof engineConfigSchema>;
