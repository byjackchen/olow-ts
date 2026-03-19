import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { configSchema, type Config } from './schema.js';

// ─── Deep Merge ───

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      key in merged &&
      typeof merged[key] === 'object' &&
      merged[key] !== null &&
      !Array.isArray(merged[key]) &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      merged[key] = deepMerge(
        merged[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

// ─── Environment Detection ───

type Env = 'LOCAL' | 'LOCAL_DOCKER' | 'DEV' | 'DEV_DOCKER' | 'UAT' | 'PRD';

const ENV_FILE_MAP: Record<Env, string> = {
  LOCAL: 'meta.local.yaml',
  LOCAL_DOCKER: 'meta.local-docker.yaml',
  DEV: 'meta.dev.yaml',
  DEV_DOCKER: 'meta.dev-docker.yaml',
  UAT: 'meta.uat.yaml',
  PRD: 'meta.prd.yaml',
};

// ─── Config Loader ───

function loadConfig(): Config {
  const env = (process.env['CHATBOT_ENV'] ?? 'LOCAL') as Env;

  // Load base config
  const basePath = './config/meta.yaml';
  const baseRaw = parse(readFileSync(basePath, 'utf-8')) as Record<string, unknown>;

  // Load env-specific override
  let merged = baseRaw;
  const overrideFile = ENV_FILE_MAP[env];
  if (overrideFile) {
    const overridePath = `./config/${overrideFile}`;
    if (existsSync(overridePath)) {
      const overrideRaw = parse(readFileSync(overridePath, 'utf-8')) as Record<string, unknown>;
      merged = deepMerge(baseRaw, overrideRaw);
    }
  }

  // Inject runtime metadata
  merged['env'] = env;
  if (typeof merged['space'] === 'string') {
    merged['space'] = merged['space'].toLowerCase();
  }

  // Validate with Zod — crashes at startup on bad config, not at runtime
  const result = configSchema.safeParse(merged);
  if (!result.success) {
    console.error('-->> Config validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.error(`-->> Environment: ${env}`);
  console.error(`-->> Space: ${result.data.space}`);
  console.error(`-->> Version: ${result.data.version}`);

  return result.data;
}

export const config = loadConfig();
export type { Config };
export { deepMerge };
