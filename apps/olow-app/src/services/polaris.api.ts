import { getLogger } from '@olow/engine';
const logger = getLogger();

// Polaris service discovery client (Tencent service mesh)

export interface ServiceInstance {
  host: string;
  port: number;
  weight: number;
  healthy: boolean;
}

export async function discoverService(
  namespace: string,
  service: string,
): Promise<ServiceInstance[]> {
  // TODO: Implement Polaris service discovery
  logger.warn('Polaris service discovery not yet implemented');
  return [];
}

export function resolveUrl(
  namespace: string,
  service: string,
  fallbackUrl: string,
): string {
  // For now, always use fallback URL
  return fallbackUrl;
}
