import { config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();

const SN_BASE = config.servicenow.url_domain;
const auth = Buffer.from(`${config.servicenow.username}:${config.servicenow.password}`).toString('base64');

async function snFetch(path: string, opts?: RequestInit): Promise<Record<string, unknown>> {
  const resp = await fetch(`${SN_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      ...opts?.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ServiceNow API error ${resp.status}: ${text}`);
  }
  return (await resp.json()) as Record<string, unknown>;
}

export async function createIncident(
  rtx: string,
  title: string,
  description: string,
): Promise<{ number: string; sys_id: string }> {
  const data = await snFetch('/api/now/table/incident', {
    method: 'POST',
    body: JSON.stringify({
      short_description: title,
      description,
      caller_id: rtx,
      contact_type: config.servicenow.contact_type,
    }),
  });
  const result = data['result'] as Record<string, unknown>;
  return { number: result['number'] as string, sys_id: result['sys_id'] as string };
}

export async function getIncident(ticketId: string): Promise<Record<string, unknown> | null> {
  const data = await snFetch(`/api/now/table/incident?sysparm_query=number=${encodeURIComponent(ticketId)}&sysparm_limit=1`);
  const results = data['result'] as Array<Record<string, unknown>>;
  return results[0] ?? null;
}

export async function queryIncidents(
  rtx: string,
  state?: string,
): Promise<Array<Record<string, unknown>>> {
  let query = `caller_id.user_name=${encodeURIComponent(rtx)}`;
  if (state && state !== '-1') query += `^state=${state}`;
  const data = await snFetch(`/api/now/table/incident?sysparm_query=${query}`);
  return (data['result'] as Array<Record<string, unknown>>) ?? [];
}

export async function getHardwareAssets(rtx: string): Promise<Array<Record<string, unknown>>> {
  const query = `assigned_to.user_name=${encodeURIComponent(rtx)}`;
  const data = await snFetch(`/api/now/table/alm_hardware?sysparm_query=${query}`);
  return (data['result'] as Array<Record<string, unknown>>) ?? [];
}

export async function addComment(ticketSysId: string, comment: string): Promise<void> {
  await snFetch(`/api/now/table/incident/${ticketSysId}`, {
    method: 'PATCH',
    body: JSON.stringify({ comments: comment }),
  });
}

export async function updateIncidentState(ticketSysId: string, state: string): Promise<void> {
  await snFetch(`/api/now/table/incident/${ticketSysId}`, {
    method: 'PATCH',
    body: JSON.stringify({ state }),
  });
}
