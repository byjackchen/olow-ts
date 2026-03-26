import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import { configSchema, type Config } from './schema.js';

// ─── .env Loader ───

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// ─── Env Interpolation ───

function interpolateEnv(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
      const [varName, ...rest] = expr.split(':-');
      const defaultValue = rest.join(':-');
      const envValue = process.env[varName!.trim()];
      if (envValue !== undefined && envValue !== '') return envValue;
      return defaultValue ?? '';
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateEnv);
  }
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateEnv(value);
    }
    return result;
  }
  return obj;
}

// ─── Config Loader ───

function loadConfig(): Config {
  loadEnvFile('./.env');

  const env = (process.env['CHATBOT_ENV'] ?? 'LOCAL');

  const basePath = './config/meta.yaml';
  const rawYaml = parse(readFileSync(basePath, 'utf-8')) as Record<string, unknown>;
  const interpolated = interpolateEnv(rawYaml) as Record<string, unknown>;

  interpolated['env'] = env;

  const result = configSchema.safeParse(interpolated);
  if (!result.success) {
    console.error('-->> Config validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.error(`-->> Environment: ${env}`);
  console.error(`-->> Version: ${result.data.version}`);

  return result.data;
}

export const config = loadConfig();
export type { Config };
