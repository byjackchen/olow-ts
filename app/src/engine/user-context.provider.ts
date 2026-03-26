// ─── User Context Provider (implements IUserContextRefresher) ───

import { getLogger } from '@olow/engine';
import type { IUserContextRefresher, UserContextResult } from '@olow/engine';
import * as workdayApi from '../services/workday.api.js';
import * as itawareApi from '../services/itaware.api.js';
import type { TokenCache } from './token-cache.js';

const logger = getLogger();

export class UserContextProvider implements IUserContextRefresher {
  constructor(
    private readonly workdayTokenCache: TokenCache,
    private readonly itawareTokenCache: TokenCache,
  ) {}

  async refresh(userId: string, proxyUserId?: string): Promise<UserContextResult> {
    const targetRtx = proxyUserId ?? userId;
    const [context, profile] = await Promise.all([
      this.fetchWorkdayContext(userId, proxyUserId),
      this.fetchItawareProfile(targetRtx),
    ]);

    return {
      context: Object.keys(context).length > 0 ? context : null,
      profile: (profile.summary || profile.topics.length > 0 || profile.tags.length > 0) ? profile : null,
    };
  }

  private async fetchWorkdayContext(userRtx: string, proxyRtx?: string): Promise<Record<string, unknown>> {
    try {
      const token = await this.workdayTokenCache.get();
      const h = await workdayApi.getContext(token, proxyRtx ?? userRtx);
      logger.info(`Workday context fetched for ${proxyRtx ?? userRtx}`);
      return {
        region: (h['region'] as Record<string, unknown>)?.['descriptor'] ?? '',
        country: ((h['country'] as string) ?? '').toUpperCase(),
        location: (h['location'] as Record<string, unknown>)?.['descriptor'] ?? '',
        department: (h['department'] as Record<string, unknown>)?.['descriptor'] ?? '',
        job_title: (h['jobTitle'] as Record<string, unknown>)?.['descriptor'] ?? '',
        worker_type: (h['workerType'] as Record<string, unknown>)?.['descriptor'] ?? '',
        company: (h['company'] as Record<string, unknown>)?.['descriptor'] ?? '',
        display_name: h['displayName'] ?? '',
        first_name: h['firstName'] ?? '',
        last_name: h['lastName'] ?? '',
        nhs_group: h['nhs_group'] ?? '',
      };
    } catch (err) {
      logger.warn({ msg: `Workday context fetch failed for ${proxyRtx ?? userRtx}`, err });
      return {};
    }
  }

  private async fetchItawareProfile(userRtx: string): Promise<{ summary: string; topics: Array<Record<string, unknown>>; tags: string[] }> {
    try {
      const token = await this.itawareTokenCache.get();
      const profile = await itawareApi.getWorkerProfile(token, userRtx);
      logger.info(`ITAware profile fetched for ${userRtx}`);
      return {
        summary: profile.summary,
        topics: profile.topics.map((t) => ({ ...t })),
        tags: profile.tags,
      };
    } catch (err) {
      logger.warn({ msg: `ITAware profile fetch failed for ${userRtx}`, err });
      return { summary: '', topics: [], tags: [] };
    }
  }
}
