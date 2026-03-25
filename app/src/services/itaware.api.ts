import { config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();

// ─── Taihu Gateway Headers ───

function getTaihuHeaders(): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return {
    'X-Taihu-PaasId': config.taihu.paas_id,
    'X-Taihu-PaasToken': config.taihu.paas_token,
    'X-Taihu-Timestamp': timestamp,
  };
}

// ─── Auth Token ───

export interface ITAwareAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function getAuthToken(): Promise<ITAwareAuthToken> {
  const domain = config.taihu.domain;
  const cfg = config.itaware;
  const url = `${domain}${cfg.ebus_prefix}/auth/service/token`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      ...getTaihuHeaders(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      account_id: cfg.auth_account_id,
      api_key: cfg.auth_api_key,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ITAware auth error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as ITAwareAuthToken;
  // Default expires_in if not provided
  if (!data.expires_in) data.expires_in = 3600;
  return data;
}

// ─── Worker Profile ───

export interface TopicItem {
  topic: string;
  need: string;
  notes: string;
  status: string;
}

export interface WorkerProfile {
  worker_oid?: string;
  summary: string;
  summary_updated_at?: string;
  topics: TopicItem[];
  topics_updated_at?: string;
  tags: string[];
  tags_updated_at?: string;
}

export async function getWorkerProfile(token: string, stableId: string): Promise<WorkerProfile> {
  const domain = config.taihu.domain;
  const cfg = config.itaware;
  const url = `${domain}${cfg.ebus_prefix}/workers/profile?stable_id=${encodeURIComponent(stableId)}`;

  const resp = await fetch(url, {
    headers: {
      ...getTaihuHeaders(),
      Authorization: `Bearer ${token}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ITAware profile error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as WorkerProfile;
  return {
    summary: data.summary ?? '',
    topics: (data.topics ?? []).map((t) => ({
      topic: t.topic ?? '',
      need: t.need ?? '',
      notes: t.notes ?? '',
      status: t.status ?? '',
    })),
    tags: data.tags ?? [],
    worker_oid: data.worker_oid,
    summary_updated_at: data.summary_updated_at,
    topics_updated_at: data.topics_updated_at,
    tags_updated_at: data.tags_updated_at,
  };
}
