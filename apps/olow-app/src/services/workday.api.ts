import { config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();

export interface WorkdayTokenResponse {
  access_token: string;
  expires_in: number;
}

export async function getAuthToken(): Promise<WorkdayTokenResponse> {
  const resp = await fetch(config.workday.url_token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.workday.client_id,
      client_secret: config.workday.client_secret,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Workday auth error ${resp.status}: ${text}`);
  }

  return (await resp.json()) as WorkdayTokenResponse;
}

export async function getContext(token: string, rtx: string): Promise<Record<string, unknown>> {
  const wql = `SELECT workersForStaffing AS workers FROM allActiveWorkers WHERE worker.rtx = '${rtx}'`;
  const resp = await fetch(`${config.workday.url_wql}?query=${encodeURIComponent(wql)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Workday WQL error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const results = data['data'] as Array<Record<string, unknown>> | undefined;
  return results?.[0] ?? {};
}
