import { z } from 'zod';

// Coercive boolean that handles "true"/"false" strings from env interpolation
const coerceBool = z.preprocess(
  (v) => (v === 'true' ? true : v === 'false' ? false : v),
  z.boolean(),
);

const llmModelSchema = z.object({
  name: z.string(),
  max_tokens: z.coerce.number(),
  max_completion_tokens: z.coerce.number().optional(),
});

export const configSchema = z.object({
  env: z.string(),
  space: z.enum(['oit', 'ohr']),
  version: z.string(),

  engine: z.object({
    max_event_loops: z.coerce.number().default(30),
    click_valid_timelapse_seconds: z.coerce.number().default(1800),
    user_context_buffer_seconds: z.coerce.number().default(259200),
    greeting_silent_seconds: z.coerce.number().default(3600),
    recent_queries_cutoff_seconds: z.coerce.number().default(900),
    rolling_requests_threshold: z.coerce.number().default(60),
    admin_chatgroup_id: z.string().default(''),
    post_msg_verbose: coerceBool.default(false),
    base_llm_provider: z.enum(['hyaide', 'openai']).default('openai'),
    base_llm_model: z.string().default('llm_gpt5_nano'),
    react_agent: z.object({
      intent_mode: z.enum(['single-rewritten', 'multi-turns']).default('multi-turns'),
      max_rounds: z.coerce.number().default(5),
      retrieval_threshold: z.coerce.number().default(0.64),
    }),
    memory: z.object({
      settings_expire_seconds: z.coerce.number().default(259200),
      actionchain_expire_seconds: z.coerce.number().default(300),
      graph_max_sessions: z.coerce.number().default(3),
      graph_nodes_max_tokens: z.coerce.number().default(6000),
    }),
    logging: z.object({
      app_log_path: z.string().default('./logs/app.log'),
      max_size_mb: z.coerce.number().default(100),
      backup_count: z.coerce.number().default(5),
      base_log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    }),
    developers: z.array(z.string()).default([]),
    administrators: z.array(z.string()).default([]),
  }),

  mcp_server: z.object({
    enabled: coerceBool.default(false),
  }).default({}),

  mcp_client: z.object({
    enabled: coerceBool.default(false),
    servers: z.array(z.object({
      name: z.string(),
      transport: z.enum(['stdio', 'sse']).default('stdio'),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      url: z.string().optional(),
      env: z.record(z.string()).optional(),
    })).default([]),
  }).default({}),

  server: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.coerce.number().default(5001),
  }),

  auth: z.object({
    api_token: z.string(),
  }),

  mongo: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().default(27017),
    database: z.string().default('oitbot'),
    username: z.string().default(''),
    password: z.string().default(''),
  }),

  redis: z.object({
    host: z.string().default('localhost'),
    port: z.coerce.number().default(6379),
    password: z.string().default(''),
    keys: z.object({
      peak_shaving: z.string().default('peak_shaving'),
      taiji_rotation: z.string().default('taiji_rotation'),
    }),
  }),

  http_client: z.object({
    timeout: z.coerce.number().default(30000),
  }),

  error_handling: z.object({
    retry_count: z.coerce.number().default(1),
    retry_delay_ms: z.coerce.number().default(500),
  }),

  broker: z.object({
    expiretime_offset_seconds: z.coerce.number().default(120),
  }),

  wecom_bot: z.object({
    token: z.string().default(''),
    aes_key: z.string().default(''),
    service_id: z.string().default(''),
    corp_id: z.string().default(''),
    corp_secret: z.string().default(''),
    text_msg_bytes_limit: z.coerce.number().default(4750),
    richtext_msg_bytes_limit: z.coerce.number().default(4000),
  }),

  wecom_groupbot: z.object({
    token: z.string().default(''),
    aes_key: z.string().default(''),
    service_id: z.string().default(''),
  }),

  slack: z.object({
    bot_user_oauth_token: z.string().default(''),
    app_level_token: z.string().default(''),
  }),

  hyaide: z.object({
    url: z.string().default(''),
    token: z.string().default(''),
    admin_user_token: z.string().default(''),
    wsid: z.string().default(''),
    polaris: z.object({
      enabled: coerceBool.default(false),
      namespace: z.string().default(''),
      service: z.string().default(''),
      fallback_url: z.string().default(''),
    }),
    faq_agent_id: z.string().default(''),
    faq_index_id: z.string().default(''),
    intent_agent_id: z.string().default(''),
    intent_index_id: z.string().default(''),
    article_agent_id: z.string().default(''),
    article_index_id: z.string().default(''),
    llm_tokens: z.array(z.string()).default([]),
    llmDeepseekV32_32k: llmModelSchema.optional(),
    llmDeepseekV3_16k: llmModelSchema.optional(),
  }),

  openai: z.object({
    api_domain: z.string().default('https://api.openai.com'),
    api_key: z.string().default(''),
    llm_gpt5_nano: llmModelSchema.optional(),
    llm_gpt5_mini: llmModelSchema.optional(),
    llm_gpt5_2: llmModelSchema.optional(),
  }),

  hunyuan: z.object({
    url_domain: z.string().default(''),
    auth_token: z.string().default(''),
    models: z.object({
      audio_realtime: z.string().default(''),
      ocr: z.string().default(''),
    }).default({}),
  }),

  workday: z.object({
    tenant_alias: z.string().default(''),
    client_id: z.string().default(''),
    client_secret: z.string().default(''),
    url_token: z.string().default(''),
    url_wql: z.string().default(''),
  }),

  servicenow: z.object({
    url_domain: z.string().default(''),
    username: z.string().default(''),
    password: z.string().default(''),
    contact_type: z.string().default('Wecom'),
    ticket_placeholder_id: z.string().default(''),
    ticket_monitor_account_id: z.string().default(''),
    ticket_open_states: z.array(z.string()).default(['1', '2', '3', '6']),
    ticket_states: z.object({
      wildcard: z.string().default('-1'),
      new: z.string().default('1'),
      inprogress: z.string().default('2'),
      onhold: z.string().default('3'),
      proposed: z.string().default('6'),
      closed: z.string().default('7'),
    }),
  }),

  statistics: z.object({
    time_interval: z.coerce.number().default(900),
    prob_new_topic: z.coerce.number().default(0),
  }),
});

export type Config = z.infer<typeof configSchema>;
