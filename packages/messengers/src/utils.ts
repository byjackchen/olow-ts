import type { ChannelType } from '@olow/engine';

export function resolveSessionId(msg: Record<string, unknown>, channelType: ChannelType | null): string {
  if (channelType === 'group') return 'default';
  const sid = msg['SessionId'];
  if (typeof sid === 'string' && sid.trim()) return sid.trim();
  return 'default';
}
